[

![Synced](https://miro.medium.com/v2/resize:fill:32:32/1*PrqgLL9XHoUR6U2JuQX9_g.png)



](https://medium.com/@synced?source=post_page---byline--7b7edfe2d072---------------------------------------)

7 min read

Apr 29, 2017

**Problem: GPU memory limitation**

I believe I don’t need to explain how powerful a GPU can be for training deep neural networks anymore. Using a commonly popular ML framework, it is much more convenient to assign the computations to GPU(s) than doing everything from scratch. However, there is one thing that could create nightmare scenarios — the DRAM limits of your GPU(s).

However, given the size of your model and the size of your batches, you can actually calculate how much GPU memory you need for training without actually running it. For example, training AlexNet with batch size of 128 requires 1.1GB of global memory, and that is just 5 convolutional layers plus 2 fully-connected layers. If we look at a bigger model, say VGG-16, using a batch size of 128 will require about 14GB of global memory. The current state-of-the-art NVIDIA Titan X has a memory capacity of 12GB . VGG-16 has only 16 convolutional layers and 3 fully-connected layers, and is much smaller than the resnet model which could contain about one hundred layers.

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/0*3yQqm76EvWtk75Fh.)

_Figure 1. GPU memory usage when using the baseline, network-wide allocation policy (left axis). (Minsoo Rhu et al. 2016)_

Now, if you want to train a model larger than VGG-16, you might have several options to solve the memory limit problem.  
– reduce your batch size, which might hinder both your training speed and accuracy.  
– distribute your model among multiple GPU(s), which is a complicated process in itself.  
– reduce your model size, if you find yourself unwilling to do the aforementioned options , or you have already tried these options but they’re not good.

Or you can simply wait for the next generation of GPUs which will have larger capacities. The industry trend is toward deeper and larger networks, and we don’t want physical DRAM limitation to be in our way.

**Observation: Who occupies the memory?**

We can divide the the data in GPU memory into 4 categories according to their functionalities:  
– Model Parameters (Weights)  
– Feature Maps  
– Gradient Maps  
– Workspace

The first three functionalities are easy to understand. Everyone knows what weights are. Feature maps are those intermediate results generated in the forward process. Gradient maps are those intermediate results generated in backward process. Workspace is a buffer used for temporary variables/matrices of cuDNN functions. For some cuDNN functions, users need to pass this buffer to the kernel as a function parameter. This buffer is freed once the function is returned.

**Observation:** **Feature Maps are the most memory-consuming part**  
This claim in this baltic title can be illustrated by the following diagram (Figure 4. Breakdown of GPU memory usage based on its functionality (Minsoo Rhu et al. 2016)).

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/0*Cqwuv9s1gI_rqHSw.)

We can see that, in general, the more layers we have, the more fraction of memory is allocated for feature maps (the triangles). We can also see that this percentage is almost always over 50% for larger models such as VGG-16.

**Idea: Use CPU memory as a temporary container**

There is one fact about feature maps: they are generated in the forward process, used immediately for the next layer, and reused only once later on, in the backward process. Each kernel function uses only feature maps that are related to the current layer (usually just 1 tensor). This will leave most of the memory silent (as they keep some data but are not used) for most of the time.

However, if most of the data has to remain silent on GPU memory, why not keep them on cheaper CPU memory? Here is a example in AlexNet that illustrates what is going on.

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/0*RbH_hnbnWiN9lAs-.)

The gaps shown on the left part illustrates how feature maps are left silent in memory. The right part of the figure shows the idea, which uses CPU memory as a temporary container for these feature maps.

**Trade-off: Time versus Space**

According to the paper, vDNN (short for virtualized DNN) successfully reduces the average GPU memory usage of AlexNet by 91% and GoogLeNet by 95%. However, you probably have already seen the price of doing so is that you may train slower. For example, vDNN enables training VGG-16 with batch size 256 on a 12GB GPU, but with 18% performance loss, compared to a hypothetical GPU with sufficient memory.

Another place this trade-off shows up in is the workspace size when using cuDNN kernels. In general, the more workspace you have, the faster algorithm you can use. Please refer to cuDNN library reference if you are interested.  
We will see this time-space trade-off through out the later discussion.

**Optimization Strategy: In Forward and Backward Process**

## Get Synced’s stories in your inbox

Join Medium for free to get updates from this writer.

Remember me for faster sign in

You probably have already known how vDNN optimizes memory allocation during forward process. The basic strategy is to offload feature maps after they are generated, prefetched back to GPU memory when they are about to be reused in backward process. The memory can be released for other use. A risk of doing so is that if the network topology is non-linear, one tensor of feature maps may be used for several layers, therefore they cannot be offloaded immediately.

In backward process, vDNN uses a more aggressive strategy. Since for the gradient maps, there are no “reuse later” issue compared to feature maps. Therefore, they can be released once the related weight updates are generated (which are pretty small comparing to those maps).

**Optimization Strategy: A Memory Manager CUDA Stream**

The key component of vDNN is a cuda stream which manages memory allocation/release, offload and prefetch. Here are some details:

The conventional cuda memory allocation/release (cudaMalloc & cudaFree) are synchronous APIs. Since they would happen constantly as the training process goes, synchronous APIs are not efficient enough.

Like the allocation/release operations, the offloading APIs need to be asynchronous as well. When a tensor of feature maps is chosen to be offloaded, the memory manager stream of vDNN will allocate a pinned memory region on host, and issue a non-blocking transfer through PCIe. These feature-map tensors are read-only during the forward process, therefore this transfer procedure can be safely overlapped with the computation. Only when the offloading procedure of the current layer is done, the program can proceed next layer.

The prefetching operation is to get the offloaded feature maps from CPU back to GPU during the backward procedure. Similar to the operations above, prefetching also needs to be asynchronous. It is easy to see that there is a data dependency between the prefetching and computation of a same layer, therefore vDNN will asynchronously start the computation of the current layer and prefetching of its previous layer at the same time.

**Cost: How do we pay the price of performance for the memory savings?**

The most significant potential performance loss comes from the implicit dependencies introduced by the offloading/prefetching. Consider the case when a data transfer takes longer time than a forward computation. This figure clearly shows the situation (Figure 9. Performance effect of offload and prefetch. (Minsoo Rhu et al. 2016)):

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/0*FXdylYApSQsGH1MA.)

Similar situation could happen in the backward process as well.

**New formalization of our problem: How to get the best performance given limited memory budget?**

As we mentioned above, there is a trade-off between time and space, and in the previous section we saw how the trade-off works. Imaging that you are training VGG-16 with batch size 128 (which takes 14GB memory if there is no offloading/prefetching) on a 12GB GPU. It might be too wastful to use only about 2GB memory, because you can use more space to alleviate the performance loss. Therefore, we can reformalize the problem in this way: **How to get the best performance given limited memory budget?**

**Configure the time-space trade-off: Decide whether a layer should be offloaded/prefetched or not, and what convolution algorithm should we choose.**

To get the best configuration, we need to decide two things for each layer: do we offload/prefetch it, and what algorithm do we use for its forward/backward process (faster algorithm means more space required).

In general, the layers closer to inputs have longer reuse distance. Therefore it is preferred to offload/prefetch these layers first. We don’t need to decide for each layer, as there are exponentially many choices with respect to the number of layers. We just need to pick one layer, and say each layer closer to the inputs are offloaded/prefetched, the rest of the layers have their tensors remaining on GPU.

To decide the algorithm for each layer is also not very practical, as again there are exponentially many choices with respect to the number of layers. We can just simplify this by forcing each layer using the same algorithm (gemm or fft or something).

Now, we have a small configuration space so that we can use greedy search to determine the best configuration solution. Here is a figure to illustrate our configuration space:

Press enter or click to view image in full size

![](https://miro.medium.com/v2/resize:fit:700/0*aSpTzRXE1lcTXNOK.)

The top-left point represents the memory-optimal configuration (offload/prefetch each layer and use the slowest algorithm), while the bottom-right point represents the performance-optimal configuration. Of course, for the real configuration space, there should be grids and the boundary between the feasibles and infeasibles should look like a ladder, yet this figure is enough to make the point.

The next part of the story is to find a feasible configuration which has the best performance. What we can do is to search the configuration along the boundary. If you are interested in the implementation details of this search procedure, please refer to the original paper (the search procedure is described in Section 3.C).

Paper Link: [https://arxiv.org/pdf/1602.08124.pdf](https://arxiv.org/pdf/1602.08124.pdf)

**Author:** _Hongyu Zhu_**| Editor:** _Ian_ **| Localized by Synced Global Team:** _Xiang Chen_