Diffusion models are a new class of state-of-the-art generative models that generate diverse high-resolution images. They have already attracted a lot of attention after OpenAI, Nvidia and Google managed to train large-scale models. Example architectures that are based on diffusion models are GLIDE, DALLE-2, Imagen, and the full open-source stable diffusion.

But what is the main principle behind them?

In this blog post, we will dig our way up from the basic principles. There are already a bunch of different diffusion-based architectures. We will focus on the most prominent one, which is the Denoising Diffusion Probabilistic Models (DDPM) as initialized by [Sohl-Dickstein et al](https://arxiv.org/abs/1503.03585) and then proposed by [Ho. et al 2020](https://arxiv.org/abs/2006.11239). Various other approaches will be discussed to a smaller extent such as stable diffusion and score-based models.

> Diffusion models are fundamentally different from all the previous generative methods. Intuitively, they aim to decompose the image generation process (sampling) in many small “denoising” steps.

The intuition behind this is that the model can correct itself over these small steps and gradually produce a good sample. To some extent, this idea of refining the representation has already been used in models like [alphafold](https://youtu.be/nGVFbPKrRWQ?t=1148). But hey, nothing comes at zero-cost. This iterative process makes them slow at sampling, at least compared to [GANs](https://theaisummer.com/gan-computer-vision/).

## Diffusion process

The basic idea behind diffusion models is rather simple. They take the input image x0\\mathbf{x}\_0 and gradually add Gaussian noise to it through a series of TT steps. We will call this the forward process. Notably, this is unrelated to the forward pass of a neural network. If you'd like, this part is necessary to generate the targets for our neural network (the image after applying t<Tt<T noise steps).

Afterward, a neural network is trained to recover the original data by reversing the noising process. By being able to model the reverse process, we can generate new data. This is the so-called reverse diffusion process or, in general, the sampling process of a generative model.

How? Let’s dive into the math to make it crystal clear.

## Forward diffusion

Diffusion models can be seen as latent variable models. Latent means that we are referring to a hidden continuous feature space. In such a way, they may look similar to [variational autoencoders (VAEs)](https://theaisummer.com/latent-variable-models/).

In practice, they are formulated using a Markov chain of TT steps. Here, a Markov chain means that each step only depends on the previous one, which is a mild assumption. Importantly, we are not constrained to using a specific type of neural network, unlike [flow-based models](https://lilianweng.github.io/posts/2018-10-13-flow-models/).

Given a data-point x0\\textbf{x}\_0 sampled from the real data distribution q(x)q(x) ( x0∼q(x)\\textbf{x}\_0 \\sim q(x)), one can define a forward diffusion process by adding noise. Specifically, at each step of the Markov chain we add Gaussian noise with variance βt\\beta\_{t} to xt−1\\textbf{x}\_{t-1}, producing a new latent variable xt\\textbf{x}\_{t} with distribution q(xt∣xt−1)q(\\textbf{x}\_t |\\textbf{x}\_{t-1}). This diffusion process can be formulated as follows:

q(xt∣xt−1)\=N(xt;μt\=1−βtxt−1,Σt\=βtI)q(\\mathbf{x}\_t \\vert \\mathbf{x}\_{t-1}) = \\mathcal{N}(\\mathbf{x}\_t; \\boldsymbol{\\mu}\_t=\\sqrt{1 - \\beta\_t} \\mathbf{x}\_{t-1}, \\boldsymbol{\\Sigma}\_t = \\beta\_t\\mathbf{I})

 [![forward-diffusion](https://theaisummer.com/static/1f5f940d6d3f1e00b3777066f6695331/073e9/forward-diffusion.png "forward-diffusion")](https://theaisummer.com/static/1f5f940d6d3f1e00b3777066f6695331/073e9/forward-diffusion.png)_Forward diffusion process. Image modified by [Ho et al. 2020](https://arxiv.org/abs/2006.11239)_

Since we are in the multi-dimensional scenario I\\textbf{I} is the identity matrix, indicating that each dimension has the same standard deviation βt\\beta\_t. Note that q(xt∣xt−1)q(\\mathbf{x}\_t \\vert \\mathbf{x}\_{t-1}) is still a normal distribution, defined by the mean μ\\boldsymbol{\\mu} and the variance Σ\\boldsymbol{\\Sigma} where μt\=1−βtxt−1\\boldsymbol{\\mu}\_t =\\sqrt{1 - \\beta\_t} \\mathbf{x}\_{t-1} and Σt\=βtI\\boldsymbol{\\Sigma}\_t=\\beta\_t\\mathbf{I}. Σ\\boldsymbol{\\Sigma} will always be a diagonal matrix of variances (here βt\\beta\_t)

Thus, we can go in a closed form from the input data x0\\mathbf{x}\_0 to xT\\mathbf{x}\_{T} in a tractable way. Mathematically, this is the posterior probability and is defined as:

q(x1:T∣x0)\=∏t\=1Tq(xt∣xt−1)q(\\mathbf{x}\_{1:T} \\vert \\mathbf{x}\_0) = \\prod^T\_{t=1} q(\\mathbf{x}\_t \\vert \\mathbf{x}\_{t-1})

The symbol :: in q(x1:T)q(\\mathbf{x}\_{1:T}) states that we apply qq repeatedly from timestep 11 to TT. It's also called trajectory.

So far, so good? Well, nah! For timestep t\=500<Tt=500 < T we need to apply qq 500 times in order to sample xt\\mathbf{x}\_t. Can't we really do better?

The [reparametrization trick](https://theaisummer.com/latent-variable-models/#reparameterization-trick) provides a magic remedy to this.

### The reparameterization trick: tractable closed-form sampling at any timestep

If we define αt\=1−βt\\alpha\_t= 1- \\beta\_t, αˉt\=∏s\=0tαs\\bar{\\alpha}\_t = \\prod\_{s=0}^t \\alpha\_s where ϵ0,...,ϵt−2,ϵt−1∼N(0,I)\\boldsymbol{\\epsilon}\_{0},..., \\epsilon\_{t-2}, \\epsilon\_{t-1} \\sim \\mathcal{N}(\\textbf{0},\\mathbf{I}), one can use the [reparameterization trick](https://theaisummer.com/latent-variable-models/#reparameterization-trick) in a recursive manner to prove that:

xt\=1−βtxt−1+βtϵt−1\=αtxt−2+1−αtϵt−2\=…\=αˉtx0+1−αˉtϵ0\\begin{aligned} \\mathbf{x}\_t &=\\sqrt{1 - \\beta\_t} \\mathbf{x}\_{t-1} + \\sqrt{\\beta\_t}\\boldsymbol{\\epsilon}\_{t-1}\\\\ &= \\sqrt{\\alpha\_t}\\mathbf{x}\_{t-2} + \\sqrt{1 - \\alpha\_t}\\boldsymbol{\\epsilon}\_{t-2} \\\\ &= \\dots \\\\ &= \\sqrt{\\bar{\\alpha}\_t}\\mathbf{x}\_0 + \\sqrt{1 - \\bar{\\alpha}\_t}\\boldsymbol{\\epsilon\_0} \\end{aligned}

> Note: Since all timestep have the same Gaussian noise we will only use the symbol ϵ\\boldsymbol{\\epsilon} from now on.

Thus to produce a sample xt\\mathbf{x}\_t we can use the following distribution:

xt∼q(xt∣x0)\=N(xt;αˉtx0,(1−αˉt)I)\\mathbf{x}\_t \\sim q(\\mathbf{x}\_t \\vert \\mathbf{x}\_0) = \\mathcal{N}(\\mathbf{x}\_t; \\sqrt{\\bar{\\alpha}\_t} \\mathbf{x}\_0, (1 - \\bar{\\alpha}\_t)\\mathbf{I})

Since βt\\beta\_t is a hyperparameter, we can precompute αt\\alpha\_t and αˉt\\bar{\\alpha}\_t for all timesteps. This means that we sample noise at any timestep tt and get xt\\mathbf{x}\_t in one go. Hence, we can sample our latent variable xt\\mathbf{x}\_t at any arbitrary timestep. This will be our target later on to calculate our tractable objective loss LtL\_t.

### Variance schedule

The variance parameter βt\\beta\_t can be fixed to a constant or chosen as a schedule over the TT timesteps. In fact, one can define a variance schedule, which can be linear, quadratic, cosine etc. The original DDPM authors utilized a linear schedule increasing from β1\=10−4\\beta\_1= 10^{-4} to βT\=0.02\\beta\_T = 0.02. [Nichol et al. 2021](https://arxiv.org/abs/2102.09672) showed that employing a cosine schedule works even better.

 [![variance-schedule](https://theaisummer.com/static/074ccf8c4830e7cdf07c68a0f1ef1864/2e195/variance-schedule.png "variance-schedule")](https://theaisummer.com/static/074ccf8c4830e7cdf07c68a0f1ef1864/2e195/variance-schedule.png)_Latent samples from linear (top) and cosine (bottom) schedules respectively. Source: [Nichol & Dhariwal 2021](https://arxiv.org/abs/2102.09672)_

## Reverse diffusion

As T→∞T \\to \\infty, the latent xTx\_T is nearly an [isotropic](https://math.stackexchange.com/questions/1991961/gaussian-distribution-is-isotropic#:~:text=TLDR%3A%20An%20isotropic%20gaussian%20is,%CE%A3%20is%20the%20covariance%20matrix.) Gaussian distribution. Therefore if we manage to learn the reverse distribution q(xt−1∣xt)q(\\mathbf{x}\_{t-1} \\vert \\mathbf{x}\_{t}) , we can sample xTx\_T from N(0,I)\\mathcal{N}(0,\\mathbf{I}), run the reverse process and acquire a sample from q(x0)q(x\_0), generating a novel data point from the original data distribution.

The question is how we can model the reverse diffusion process.

### Approximating the reverse process with a neural network

In practical terms, we don't know q(xt−1∣xt)q(\\mathbf{x}\_{t-1} \\vert \\mathbf{x}\_{t}). It's intractable since statistical estimates of q(xt−1∣xt)q(\\mathbf{x}\_{t-1} \\vert \\mathbf{x}\_{t}) require computations involving the data distribution.

Instead, we approximate q(xt−1∣xt)q(\\mathbf{x}\_{t-1} \\vert \\mathbf{x}\_{t}) with a parameterized model pθp\_{\\theta} (e.g. a neural network). Since q(xt−1∣xt)q(\\mathbf{x}\_{t-1} \\vert \\mathbf{x}\_{t}) will also be Gaussian, for small enough βt\\beta\_t, we can choose pθp\_{\\theta} to be Gaussian and just parameterize the mean and variance:

pθ(xt−1∣xt)\=N(xt−1;μθ(xt,t),Σθ(xt,t))p\_\\theta(\\mathbf{x}\_{t-1} \\vert \\mathbf{x}\_t) = \\mathcal{N}(\\mathbf{x}\_{t-1}; \\boldsymbol{\\mu}\_\\theta(\\mathbf{x}\_t, t), \\boldsymbol{\\Sigma}\_\\theta(\\mathbf{x}\_t, t))

 [![reverse-diffusion](https://theaisummer.com/static/9bb372bb74034360fe7891d546e3c5b4/01dae/reverse-diffusion.png "reverse-diffusion")](https://theaisummer.com/static/9bb372bb74034360fe7891d546e3c5b4/01dae/reverse-diffusion.png)_Reverse diffusion process. Image modified by [Ho et al. 2020](https://arxiv.org/abs/2006.11239)_

If we apply the reverse formula for all timesteps (pθ(x0:T)p\_\\theta(\\mathbf{x}\_{0:T}), also called trajectory), we can go from xT\\mathbf{x}\_T to the data distribution:

pθ(x0:T)\=pθ(xT)∏t\=1Tpθ(xt−1∣xt)p\_\\theta(\\mathbf{x}\_{0:T}) = p\_{\\theta}(\\mathbf{x}\_T) \\prod^T\_{t=1} p\_\\theta(\\mathbf{x}\_{t-1} \\vert \\mathbf{x}\_t)

By additionally conditioning the model on timestep tt, it will learn to predict the Gaussian parameters (meaning the mean μθ(xt,t)\\boldsymbol{\\mu}\_\\theta(\\mathbf{x}\_t, t) and the covariance matrix Σθ(xt,t)\\boldsymbol{\\Sigma}\_\\theta(\\mathbf{x}\_t, t) ) for each timestep.

But how do we train such a model?

## Training a diffusion model

If we take a step back, we can notice that the combination of qq and pp is very similar to a variational autoencoder (VAE). Thus, we can train it by optimizing the negative log-likelihood of the training data. After a series of calculations, which we won't analyze here, we can write the evidence lower bound (ELBO) as follows:

logp(x)≥Eq(x1∣x0)\[logpθ(x0∣x1)\]−DKL(q(xT∣x0)∣∣p(xT))−∑t\=2TEq(xt∣x0)\[DKL(q(xt−1∣xt,x0)∣∣pθ(xt−1∣xt))\]\=L0−LT−∑t\=2TLt−1\\begin{aligned} log p(\\mathbf{x}) \\geq &\\mathbb{E}\_{q(x\_1 \\vert x\_0)} \[log p\_{\\theta} (\\mathbf{x}\_0 \\vert \\mathbf{x}\_1)\] - \\\\ &D\_{KL}(q(\\mathbf{x}\_T \\vert \\mathbf{x}\_0) \\vert\\vert p(\\mathbf{x}\_T))- \\\\ &\\sum\_{t=2}^T \\mathbb{E}\_{q(\\mathbf{x}\_t \\vert \\mathbf{x}\_0)} \[D\_{KL}(q(\\mathbf{x}\_{t-1} \\vert \\mathbf{x}\_t, \\mathbf{x}\_0) \\vert \\vert p\_{\\theta}(\\mathbf{x}\_{t-1} \\vert \\mathbf{x}\_t)) \] \\\\ & = L\_0 - L\_T - \\sum\_{t=2}^T L\_{t-1} \\end{aligned}

Let's analyze these terms:

1.  The Eq(x1∣x0)\[logpθ(x0∣x1)\]\\mathbb{E}\_{q(x\_1 \\vert x\_0)} \[log p\_{\\theta} (\\mathbf{x}\_0 \\vert \\mathbf{x}\_1)\] term can been as a reconstruction term, similar to the one in the ELBO of a variational autoencoder. In [Ho et al 2020](https://arxiv.org/abs/2006.11239) , this term is learned using a separate decoder.
    
2.  DKL(q(xT∣x0)∣∣p(xT))D\_{KL}(q(\\mathbf{x}\_T \\vert \\mathbf{x}\_0) \\vert\\vert p(\\mathbf{x}\_T)) shows how close xT\\mathbf{x}\_T is to the standard Gaussian. Note that the entire term has no trainable parameters so it's ignored during training.
    
3.  The third term ∑t\=2TLt−1\\sum\_{t=2}^T L\_{t-1}, also referred as LtL\_t, formulate the difference between the desired denoising steps pθ(xt−1∣xt))p\_{\\theta}(\\mathbf{x}\_{t-1} \\vert \\mathbf{x}\_t)) and the approximated ones q(xt−1∣xt,x0)q(\\mathbf{x}\_{t-1} \\vert \\mathbf{x}\_t, \\mathbf{x}\_0).
    

It is evident that through the ELBO, maximizing the likelihood boils down to learning the denoising steps LtL\_t.

> **Important note**: Even though q(xt−1∣xt)q(\\mathbf{x}\_{t-1} \\vert \\mathbf{x}\_{t}) is intractable [Sohl-Dickstein et al](https://arxiv.org/abs/1503.03585) illustrated that by additionally conditioning on x0\\textbf{x}\_0 makes it tractable.

Intuitively, a painter (our generative model) needs a reference image (x0\\textbf{x}\_0) to slowly draw (reverse diffusion step q(xt−1∣xt,x0)q(\\mathbf{x}\_{t-1} \\vert \\mathbf{x}\_t, \\mathbf{x}\_0)) an image. Thus, we can take a small step backwards, meaning from noise to generate an image, if and only if we have x0\\textbf{x}\_0 as a reference.

In other words, we can sample xt\\textbf{x}\_t at noise level tt conditioned on x0\\textbf{x}\_0. Since αt\=1−βt\\alpha\_t= 1- \\beta\_t and αˉt\=∏s\=0tαs\\bar{\\alpha}\_t = \\prod\_{s=0}^t \\alpha\_s, we can prove that:

q(xt−1∣xt,x0)\=N(xt−1;μ~(xt,x0),β~tI)β~t\=1−αˉt−11−αˉt⋅βtμ~t(xt,x0)\=αˉt−1βt1−αˉtx0+αt(1−αˉt−1)1−αˉtxt\\begin{aligned} q(\\mathbf{x}\_{t-1} \\vert \\mathbf{x}\_t, \\mathbf{x}\_0) &= \\mathcal{N}(\\mathbf{x}\_{t-1}; {\\tilde{\\boldsymbol{\\mu}}}(\\mathbf{x}\_t, \\mathbf{x}\_0), {\\tilde{\\beta}\_t} \\mathbf{I}) \\\\ \\tilde{\\beta}\_t &= \\frac{1 - \\bar{\\alpha}\_{t-1}}{1 - \\bar{\\alpha}\_t} \\cdot \\beta\_t \\\\ \\tilde{\\boldsymbol{\\mu}}\_t (\\mathbf{x}\_t, \\mathbf{x}\_0) &= \\frac{\\sqrt{\\bar{\\alpha}\_{t-1}}\\beta\_t}{1 - \\bar{\\alpha}\_t} \\mathbf{x\_0} + \\frac{\\sqrt{\\alpha\_t}(1 - \\bar{\\alpha}\_{t-1})}{1 - \\bar{\\alpha}\_t} \\mathbf{x}\_t \\end{aligned}

> Note that αt\\alpha\_t and αˉt\\bar{\\alpha}\_t depend only on βt\\beta\_t, so they can be precomputed.

This little trick provides us with a fully tractable ELBO. The above property has one more important side effect, as we already saw in the reparameterization trick, we can represent x0\\mathbf{x}\_0 as

x0\=1αˉt(xt−1−αˉtϵ)),\\mathbf{x}\_0 = \\frac{1}{\\sqrt{\\bar{\\alpha}\_t}}(\\mathbf{x}\_t - \\sqrt{1 - \\bar{\\alpha}\_t} \\boldsymbol{\\epsilon})),

where ϵ∼N(0,I)\\boldsymbol{\\epsilon} \\sim \\mathcal{N}(\\textbf{0},\\mathbf{I}).

By combining the last two equations, each timestep will now have a mean μ~t\\tilde{\\boldsymbol{\\mu}}\_t (our target) that only depends on xt\\mathbf{x}\_t:

μ~t(xt)\=1αt(xt−βt1−αˉtϵ))\\tilde{\\boldsymbol{\\mu}}\_t (\\mathbf{x}\_t) = {\\frac{1}{\\sqrt{\\alpha\_t}} \\Big( \\mathbf{x}\_t - \\frac{\\beta\_t}{\\sqrt{1 - \\bar{\\alpha}\_t}} \\boldsymbol{\\epsilon} ) \\Big)}

Therefore we can use a neural network ϵθ(xt,t)\\epsilon\_{\\theta}(\\mathbf{x}\_t,t) to approximate ϵ\\boldsymbol{\\epsilon} and consequently the mean:

μθ~(xt,t)\=1αt(xt−βt1−αˉtϵθ(xt,t))\\tilde{\\boldsymbol{\\mu}\_{\\theta}}( \\mathbf{x}\_t,t) = {\\frac{1}{\\sqrt{\\alpha\_t}} \\Big( \\mathbf{x}\_t - \\frac{\\beta\_t}{\\sqrt{1 - \\bar{\\alpha}\_t}} \\boldsymbol{\\epsilon}\_{\\theta}(\\mathbf{x}\_t,t) \\Big)}

Thus, the loss function (the denoising term in the ELBO) can be expressed as:

Lt\=Ex0,t,ϵ\[12∣∣Σθ(xt,t)∣∣22∣∣μ~t−μθ(xt,t)∣∣22\]\=Ex0,t,ϵ\[βt22αt(1−αˉt)∣∣Σθ∣∣22∥ϵt−ϵθ(aˉtx0+1−aˉtϵ,t)∣∣2\]\\begin{aligned} L\_t &= \\mathbb{E}\_{\\mathbf{x}\_0,t,\\boldsymbol{\\epsilon}}\\Big\[\\frac{1}{2||\\boldsymbol{\\Sigma}\_\\theta (x\_t,t)||\_2^2} ||\\tilde{\\boldsymbol{\\mu}}\_t - \\boldsymbol{\\mu}\_\\theta(\\mathbf{x}\_t, t)||\_2^2 \\Big\] \\\\ &= \\mathbb{E}\_{\\mathbf{x}\_0,t,\\boldsymbol{\\epsilon}}\\Big\[\\frac{\\beta\_t^2}{2\\alpha\_t (1 - \\bar{\\alpha}\_t) ||\\boldsymbol{\\Sigma}\_\\theta||^2\_2} \\| \\boldsymbol{\\epsilon}\_{t}- \\boldsymbol{\\epsilon}\_{\\theta}(\\sqrt{\\bar{a}\_t} \\mathbf{x}\_0 + \\sqrt{1-\\bar{a}\_t}\\boldsymbol{\\epsilon}, t ) ||^2 \\Big\] \\end{aligned}

This effectively shows us that instead of predicting the mean of the distribution, the model will predict the noise ϵ\\boldsymbol{\\epsilon} at each timestep tt.

[Ho et.al 2020](https://arxiv.org/abs/2006.11239) made a few simplifications to the actual loss term as they ignore a weighting term. The simplified version outperforms the full objective:

Ltsimple\=Ex0,t,ϵ\[∥ϵ−ϵθ(aˉtx0+1−aˉtϵ,t)∣∣2\]L\_t^\\text{simple} = \\mathbb{E}\_{\\mathbf{x}\_0, t, \\boldsymbol{\\epsilon}} \\Big\[\\|\\boldsymbol{\\epsilon}- \\boldsymbol{\\epsilon}\_{\\theta}(\\sqrt{\\bar{a}\_t} \\mathbf{x}\_0 + \\sqrt{1-\\bar{a}\_t} \\boldsymbol{\\epsilon}, t ) ||^2 \\Big\]

The authors found that optimizing the above objective works better than optimizing the original ELBO. The proof for both equations can be found in this [excellent post by Lillian Weng](https://lilianweng.github.io/posts/2021-07-11-diffusion-models/#reverse-diffusion-process) or in [Luo et al. 2022](https://arxiv.org/abs/2208.11970).

Additionally, [Ho et. al 2020](https://arxiv.org/abs/2006.11239) decide to keep the variance fixed and have the network learn only the mean. This was later improved by [Nichol et al. 2021](https://arxiv.org/abs/2102.09672), who decide to let the network learn the covariance matrix (Σ)(\\boldsymbol{\\Sigma}) as well (by modifying LtsimpleL\_t^\\text{simple} ), achieving better results.

 [![training-sampling-ddpm](https://theaisummer.com/static/411d503d7233bc525088aa275f30f74e/c1b63/training-sampling-ddpm.png "training-sampling-ddpm")](https://theaisummer.com/static/411d503d7233bc525088aa275f30f74e/4fa52/training-sampling-ddpm.png)_Training and sampling algorithms of DDPMs. Source: [Ho et al. 2020](https://arxiv.org/abs/2006.11239)_

## Architecture

One thing that we haven't mentioned so far is what the model's architecture looks like. Notice that the model's input and output should be of the same size.

To this end, [Ho et al.](https://arxiv.org/abs/2006.11239) employed a U-Net. If you are unfamiliar with U-Nets, feel free to check out our past article on the [major U-Net architectures](https://theaisummer.com/unet-architectures/). In a few words, a U-Net is a symmetric architecture with input and output of the same spatial size that uses [skip connections](https://theaisummer.com/skip-connections/) between encoder and decoder blocks of corresponding feature dimension. Usually, the input image is first downsampled and then upsampled until reaching its initial size.

In the original implementation of DDPMs, the U-Net consists of Wide [ResNet blocks](https://theaisummer.com/skip-connections/#resnet-skip-connections-via-addition), [group normalization](https://theaisummer.com/normalization/#group-normalization-2018) as well as [self-attention](https://theaisummer.com/attention/) blocks.

The diffusion timestep tt is specified by adding a sinusoidal [position embedding](https://theaisummer.com/positional-embeddings/) into each residual block. For more details, feel free to visit the [official GitHub repository](https://github.com/hojonathanho/diffusion). For a detailed implementation of the diffusion model, check out this awesome [post by Hugging Face](https://huggingface.co/blog/annotated-diffusion).

 [![unet](https://theaisummer.com/static/8e35326846f64b64741e92d6ce4cf8b6/58213/unet.png "unet")](https://theaisummer.com/static/8e35326846f64b64741e92d6ce4cf8b6/58213/unet.png)_The U-Net architecture. Source: [Ronneberger et al.](https://arxiv.org/abs/1505.04597)_

## Conditional Image Generation: Guided Diffusion

A crucial aspect of image generation is conditioning the sampling process to manipulate the generated samples. Here, this is also referred to as guided diffusion.

There have even been methods that incorporate image embeddings into the diffusion in order to "guide" the generation. Mathematically, guidance refers to conditioning a prior data distribution p(x)p(\\textbf{x}) with a condition yy, i.e. the class label or an image/text embedding, resulting in p(x∣y)p(\\textbf{x}|y).

To turn a diffusion model pθp\_\\theta into a conditional diffusion model, we can add conditioning information yy at each diffusion step.

pθ(x0:T∣y)\=pθ(xT)∏t\=1Tpθ(xt−1∣xt,y)p\_\\theta(\\mathbf{x}\_{0:T} \\vert y) = p\_\\theta(\\mathbf{x}\_T) \\prod^T\_{t=1} p\_\\theta(\\mathbf{x}\_{t-1} \\vert \\mathbf{x}\_t, y)

The fact that the conditioning is being seen at each timestep may be a good justification for the excellent samples from a text prompt.

In general, guided diffusion models aim to learn ∇log⁡pθ(xt∣y)\\nabla \\log p\_\\theta( \\mathbf{x}\_t \\vert y). So using the Bayes rule, we can write:

∇xtlog⁡pθ(xt∣y)\=∇xtlog⁡(pθ(y∣xt)pθ(xt)pθ(y))\=∇xtlogpθ(xt)+∇xtlog(pθ(y∣xt))\\begin{aligned} \\nabla\_{\\textbf{x}\_{t}} \\log p\_\\theta(\\mathbf{x}\_t \\vert y) &= \\nabla\_{\\textbf{x}\_{t}} \\log (\\frac{p\_\\theta(y \\vert \\mathbf{x}\_t) p\_\\theta(\\mathbf{x}\_t) }{p\_\\theta(y)}) \\\\ &= \\nabla\_{\\textbf{x}\_{t}} log p\_\\theta(\\mathbf{x}\_t) + \\nabla\_{\\textbf{x}\_{t}} log (p\_\\theta( y \\vert\\mathbf{x}\_t )) \\end{aligned}

pθ(y)p\_\\theta(y) is removed since the gradient operator ∇xt\\nabla\_{\\textbf{x}\_{t}} refers only to xt\\textbf{x}\_{t}, so no gradient for yy. Moreover remember that log⁡(ab)\=log⁡(a)+log⁡(b)\\log(a b)= \\log(a) + \\log(b).

And by adding a guidance scalar term ss, we have:

∇log⁡pθ(xt∣y)\=∇log⁡pθ(xt)+s⋅∇log⁡(pθ(y∣xt))\\nabla \\log p\_\\theta(\\mathbf{x}\_t \\vert y) = \\nabla \\log p\_\\theta(\\mathbf{x}\_t) + s \\cdot \\nabla \\log (p\_\\theta( y \\vert\\mathbf{x}\_t ))

Using this formulation, let's make a distinction between classifier and classifier-free guidance. Next, we will present two family of methods aiming at injecting label information.

### Classifier guidance

[Sohl-Dickstein et al](https://arxiv.org/abs/1503.03585). and later [Dhariwal and Nichol](https://arxiv.org/abs/2105.05233) showed that we can use a second model, a classifier fϕ(y∣xt,t)f\_\\phi(y \\vert \\mathbf{x}\_t, t), to guide the diffusion toward the target class yy during training. To achieve that, we can train a classifier fϕ(y∣xt,t)f\_\\phi(y \\vert \\mathbf{x}\_t, t) on the noisy image xt\\mathbf{x}\_t to predict its class yy. Then we can use the gradients ∇log⁡(fϕ(y∣xt))\\nabla \\log (f\_\\phi( y \\vert\\mathbf{x}\_t )) to guide the diffusion. How?

We can build a class-conditional diffusion model with mean μθ(xt∣y)\\mu\_\\theta(\\mathbf{x}\_t|y) and variance Σθ(xt∣y)\\boldsymbol{\\Sigma}\_\\theta(\\mathbf{x}\_t |y).

Since pθ∼N(μθ,Σθ)p\_\\theta \\sim \\mathcal{N}(\\mu\_{\\theta}, \\Sigma\_{\\theta}), we can show using the guidance formulation from the previous section that the mean is perturbed by the gradients of log⁡fϕ(y∣xt)\\log f\_\\phi(y|\\mathbf{x}\_t) of class yy, resulting in:

μ^(xt∣y)\=μθ(xt∣y)+s⋅Σθ(xt∣y)∇xtlogfϕ(y∣xt,t)\\hat{\\mu}(\\mathbf{x}\_t |y) =\\mu\_\\theta(\\mathbf{x}\_t |y) + s \\cdot \\boldsymbol{\\Sigma}\_\\theta(\\mathbf{x}\_t |y) \\nabla\_{\\mathbf{x}\_t} logf\_\\phi(y \\vert \\mathbf{x}\_t, t)

In the famous [GLIDE paper by Nichol et al](https://arxiv.org/abs/2112.10741), the authors expanded on this idea and use [CLIP embeddings](https://theaisummer.com/vision-language-models/#clip) to guide the diffusion. CLIP as proposed by [Saharia et al.](https://arxiv.org/abs/2205.11487), consists of an image encoder gg and a text encoder hh. It produces an image and text embeddings g(xt)g(\\mathbf{x}\_t) and h(c)h(c), respectively, wherein cc is the text caption.

Therefore, we can perturb the gradients with their dot product:

μ^(xt∣c)\=μ(xt∣c)+s⋅Σθ(xt∣c)∇xtg(xt)⋅h(c)\\hat{\\mu}(\\mathbf{x}\_t |c) =\\mu(\\mathbf{x}\_t |c) + s \\cdot \\boldsymbol{\\Sigma}\_\\theta(\\mathbf{x}\_t |c) \\nabla\_{\\mathbf{x}\_t} g(\\mathbf{x}\_t) \\cdot h(c)

As a result, they manage to "steer" the generation process toward a user-defined text caption.

 [![classifier-guidance](https://theaisummer.com/static/671ddf9d25d76db9371deac995a52642/1c1a4/classifier-guidance.png "classifier-guidance")](https://theaisummer.com/static/671ddf9d25d76db9371deac995a52642/1c1a4/classifier-guidance.png)_Algorithm of classifier guided diffusion sampling. Source: [Dhariwal & Nichol 2021](https://arxiv.org/abs/2105.05233)_

### Classifier-free guidance

Using the same formulation as before we can define a classifier-free guided diffusion model as:

∇log⁡p(xt∣y)\=s⋅∇log(p(xt∣y))+(1−s)⋅∇logp(xt)\\nabla \\log p(\\mathbf{x}\_t \\vert y) =s \\cdot \\nabla log(p(\\mathbf{x}\_t \\vert y)) + (1-s) \\cdot \\nabla log p(\\mathbf{x}\_t)

Guidance can be achieved without a second classifier model as proposed by [Ho & Salimans](https://openreview.net/forum?id=qw8AKxfYbI). Instead of training a separate classifier, the authors trained a conditional diffusion model ϵθ(xt∣y)\\boldsymbol{\\epsilon}\_\\theta (\\mathbf{x}\_t|y) together with an unconditional model ϵθ(xt∣0)\\boldsymbol{\\epsilon}\_\\theta (\\mathbf{x}\_t |0). In fact, they use the exact same neural network. During training, they randomly set the class yy to 00, so that the model is exposed to both the conditional and unconditional setup:

ϵ^θ(xt∣y)\=s⋅ϵθ(xt∣y)+(1−s)⋅ϵθ(xt∣0)\=ϵθ(xt∣0)+s⋅(ϵθ(xt∣y)−ϵθ(xt∣0))\\begin{aligned} \\hat{\\boldsymbol{\\epsilon}}\_\\theta(\\mathbf{x}\_t |y) & = s \\cdot \\boldsymbol{\\epsilon}\_\\theta(\\mathbf{x}\_t |y) + (1-s) \\cdot \\boldsymbol{\\epsilon}\_\\theta(\\mathbf{x}\_t |0) \\\\ &= \\boldsymbol{\\epsilon}\_\\theta(\\mathbf{x}\_t |0) + s \\cdot (\\boldsymbol{\\epsilon}\_\\theta(\\mathbf{x}\_t |y) -\\boldsymbol{\\epsilon}\_\\theta(\\mathbf{x}\_t |0) ) \\end{aligned}

> Note that this can also be used to "inject" text embeddings as we showed in classifier guidance.

This admittedly "weird" process has two major advantages:

*   It uses only a single model to guide the diffusion.
    
*   It simplifies guidance when conditioning on information that is difficult to predict with a classifier (such as text embeddings).
    

Imagen as proposed by [Saharia et al](https://arxiv.org/abs/2205.11487). relies heavily on classifier-free guidance, as they find that it is a key contributor to generating samples with strong image-text alignment. For more info on the approach of Imagen check out this video from AI Coffee Break with Letitia:

## Scaling up diffusion models

You might be asking what is the problem with these models. Well, it's computationally very expensive to scale these U-nets into high-resolution images. This brings us to two methods for scaling up diffusion models to higher resolutions: cascade diffusion models and latent diffusion models.

### Cascade diffusion models

[Ho et al. 2021](https://arxiv.org/abs/2106.15282) introduced cascade diffusion models in an effort to produce high-fidelity images. A cascade diffusion model consists of a pipeline of many sequential diffusion models that generate images of increasing resolution. Each model generates a sample with superior quality than the previous one by successively upsampling the image and adding higher resolution details. To generate an image, we sample sequentially from each diffusion model.

 [![cascade-diffusion](https://theaisummer.com/static/2abb7ee11f7295d634fabf8820156d8c/eba85/cascade-diffusion.png "cascade-diffusion")](https://theaisummer.com/static/2abb7ee11f7295d634fabf8820156d8c/eba85/cascade-diffusion.png)_Cascade diffusion model pipeline. Source: Ho & Saharia et al._

To acquire good results with cascaded architectures, strong data augmentations on the input of each super-resolution model are crucial. Why? Because it alleviates compounding error from the previous cascaded models, as well as due to a train-test mismatch.

It was found that gaussian blurring is a critical transformation toward achieving high fidelity. They refer to this technique as conditioning augmentation.

### Stable diffusion: Latent diffusion models

Latent diffusion models are based on a rather simple idea: instead of applying the diffusion process directly on a high-dimensional input, we project the input into a smaller latent space and apply the diffusion there.

In more detail, [Rombach et al](https://arxiv.org/abs/2112.10752). proposed to use an encoder network to encode the input into a latent representation i.e. zt\=g(xt)\\mathbf{z}\_t = g(\\mathbf{x}\_t). The intuition behind this decision is to lower the computational demands of training diffusion models by processing the input in a lower dimensional space. Afterward, a standard diffusion model (U-Net) is applied to generate new data, which are upsampled by a decoder network.

If the loss for a typical diffusion model (DM) is formulated as:

LDM\=Ex,t,ϵ\[∥ϵ−ϵθ(xt,t)∣∣2\]L \_{DM} = \\mathbb{E}\_{\\mathbf{x}, t, \\boldsymbol{\\epsilon}} \\Big\[\\| \\boldsymbol{\\epsilon}- \\boldsymbol{\\epsilon}\_{\\theta}( \\mathbf{x}\_t, t ) ||^2 \\Big\]

then given an encoder E\\mathcal{E} and a latent representation zz, the loss for a latent diffusion model (LDM) is:

LLDM\=EE(x),t,ϵ\[∥ϵ−ϵθ(zt,t)∣∣2\]L \_{LDM} = \\mathbb{E}\_{ \\mathcal{E}(\\mathbf{x}), t, \\boldsymbol{\\epsilon}} \\Big\[\\| \\boldsymbol{\\epsilon}- \\boldsymbol{\\epsilon}\_{\\theta}( \\mathbf{z}\_t, t ) ||^2 \\Big\]

 [![stable-diffusion](https://theaisummer.com/static/59e73a1bfb457aa0665b14ad9b914cbc/c1b63/stable-diffusion.png "stable-diffusion")](https://theaisummer.com/static/59e73a1bfb457aa0665b14ad9b914cbc/0d0e4/stable-diffusion.png)_Latent diffusion models. Source: [Rombach et al](https://arxiv.org/abs/2112.10752)_

For more information check out this video:

## Score-based generative models

Around the same time as the DDPM paper, [Song and Ermon](https://arxiv.org/abs/1907.05600) proposed a different type of generative model that appears to have many similarities with diffusion models. Score-based models tackle generative learning using score matching and Langevin dynamics.

> [Score-matching](https://www.jmlr.org/papers/v6/hyvarinen05a.html) refers to the process of modeling the gradient of the log probability density function, also known as the score function. [Langevin dynamics](https://en.wikipedia.org/wiki/Langevin_dynamics) is an iterative process that can draw samples from a distribution using only its score function.

xt\=xt−1+δ2∇xlog⁡p(xt−1)+δϵ, where ϵ∼N(0,I)\\mathbf{x}\_t=\\mathbf{x}\_{t-1}+\\frac{\\delta}{2} \\nabla\_{\\mathbf{x}} \\log p\\left(\\mathbf{x}\_{t-1}\\right)+\\sqrt{\\delta} \\boldsymbol{\\epsilon}, \\quad \\text { where } \\boldsymbol{\\epsilon} \\sim \\mathcal{N}(\\mathbf{0}, \\mathbf{I})

where δ\\delta is the step size.

Suppose that we have a probability density p(x)p(x) and that we define the score function to be ∇xlog⁡p(x)\\nabla\_x \\log p(x). We can then train a neural network sθs\_{\\theta} to estimate ∇xlog⁡p(x)\\nabla\_x \\log p(x) without estimating p(x)p(x) first. The training objective can be formulated as follows:

Ep(x)\[∥∇xlog⁡p(x)−sθ(x)∥22\]\=∫p(x)∥∇xlog⁡p(x)−sθ(x)∥22dx\\mathbb{E}\_{p(\\mathbf{x})}\[\\| \\nabla\_\\mathbf{x} \\log p(\\mathbf{x}) - \\mathbf{s}\_\\theta(\\mathbf{x}) \\|\_2^2\] = \\int p(\\mathbf{x}) \\| \\nabla\_\\mathbf{x} \\log p(\\mathbf{x}) - \\mathbf{s}\_\\theta(\\mathbf{x}) \\|\_2^2 \\mathrm{d}\\mathbf{x}

Then by using Langevin dynamics, we can directly sample from p(x)p(x) using the approximated score function.

> In case you missed it, guided diffusion models use this formulation of score-based models as they learn directly ∇xlog⁡p(x)\\nabla\_x \\log p(x). Of course, they don’t rely on Langevin dynamics.

### Adding noise to score-based models: Noise Conditional Score Networks (NCSN)

> The problem so far: the estimated score functions are usually inaccurate in low-density regions, where few data points are available. As a result, the quality of data sampled using Langevin dynamics is **not** good.

Their solution was to perturb the data points with noise and train score-based models on the noisy data points instead. As a matter of fact, they used multiple scales of Gaussian noise perturbations.

Thus, adding noise is the key to make both DDPM and score based models work.

 [![score-based](https://theaisummer.com/static/dc655bf322dddc80d5596899e053c5e6/c1b63/score-based.png "score-based")](https://theaisummer.com/static/dc655bf322dddc80d5596899e053c5e6/a878e/score-based.png)_Score-based generative modeling with score matching + Langevin dynamics. Source: [Generative Modeling by Estimating Gradients of the Data Distribution](https://yang-song.github.io/blog/2021/score/)_

Mathematically, given the data distribution p(x)p(x), we perturb with Gaussian noise N(0,σi2I)\\mathcal{N}(\\textbf{0}, \\sigma\_i^2 I) where i\=1,2,⋯ ,Li=1,2,\\cdots,L to obtain a noise-perturbed distribution:

pσi(x)\=∫p(y)N(x;y,σi2I)dyp\_{\\sigma\_i}(\\mathbf{x}) = \\int p(\\mathbf{y}) \\mathcal{N}(\\mathbf{x}; \\mathbf{y}, \\sigma\_i^2 I) \\mathrm{d} \\mathbf{y}

Then we train a network sθ(x,i)s\_\\theta(\\mathbf{x},i), known as Noise Conditional Score-Based Network (NCSN) to estimate the score function ∇xlog⁡dσi(x)\\nabla\_\\mathbf{x} \\log d\_{\\sigma\_i}(\\mathbf{x}). The training objective is a weighted sum of [Fisher divergences](https://en.wikipedia.org/wiki/Fisher_information_metric) for all noise scales.

∑i\=1Lλ(i)Epσi(x)\[∥∇xlog⁡pσi(x)−sθ(x,i)∥22\]\\sum\_{i=1}^L \\lambda(i) \\mathbb{E}\_{p\_{\\sigma\_i}(\\mathbf{x})}\[\\| \\nabla\_\\mathbf{x} \\log p\_{\\sigma\_i}(\\mathbf{x}) - \\mathbf{s}\_\\theta(\\mathbf{x}, i) \\|\_2^2\]

### Score-based generative modeling through stochastic differential equations (SDE)

[Song et al. 2021](https://arxiv.org/abs/2011.13456) explored the connection of score-based models with diffusion models. In an effort to encapsulate both NSCNs and DDPMs under the same umbrella, they proposed the following:

Instead of perturbing data with a finite number of noise distributions, we use a continuum of distributions that evolve over time according to a diffusion process. This process is modeled by a prescribed stochastic differential equation (SDE) that does not depend on the data and has no trainable parameters. By reversing the process, we can generate new samples.

 [![score-sde](https://theaisummer.com/static/d007d60f773b61f4585cbec3869490d5/c1b63/score-sde.png "score-sde")](https://theaisummer.com/static/d007d60f773b61f4585cbec3869490d5/a878e/score-sde.png)_Score-based generative modeling through stochastic differential equations (SDE). Source: [Song et al. 2021](https://arxiv.org/abs/2011.13456)_

We can define the diffusion process {x(t)}t∈\[0,T\]\\{ \\mathbf{x}(t) \\}\_{t\\in \[0, T\]} as an SDE in the following form:

dx\=f(x,t)dt+g(t)dw\\mathrm{d}\\mathbf{x} = \\mathbf{f}(\\mathbf{x}, t) \\mathrm{d}t + g(t) \\mathrm{d} \\mathbf{w}

where w\\mathbf{w} is the [Wiener process](https://en.wikipedia.org/wiki/Wiener_process) (a.k.a., [Brownian motion](https://en.wikipedia.org/wiki/Brownian_motion)), f(⋅,t)\\mathbf{f}(\\cdot, t) is a vector-valued function called the drift coefficient of x(t)\\mathbf{x}(t), and g(⋅)g(\\cdot) is a scalar function known as the diffusion coefficient of x(t)\\mathbf{x}(t). Note that the SDE typically has a unique strong solution.

> To make sense of why we use an SDE, here is a tip: the SDE is inspired by the Brownian motion, in which a number of particles move randomly inside a medium. This randomness of the particles' motion models the continuous noise perturbations on the data.

After perturbing the original data distribution for a sufficiently long time, the perturbed distribution becomes close to a tractable noise distribution.

To generate new samples, we need to reverse the diffusion process. The SDE was chosen to have a corresponding reverse SDE in closed form:

dx\=\[f(x,t)−g2(t)∇xlog⁡pt(x)\]dt+g(t)dw\\mathrm{d}\\mathbf{x} = \[\\mathbf{f}(\\mathbf{x}, t) - g^2(t) \\nabla\_\\mathbf{x} \\log p\_t(\\mathbf{x})\]\\mathrm{d}t + g(t) \\mathrm{d} \\mathbf{w}

To compute the reverse SDE, we need to estimate the score function ∇xlog⁡pt(x)\\nabla\_\\mathbf{x} \\log p\_t(\\mathbf{x}). This is done using a score-based model sθ(x,i)s\_\\theta(\\mathbf{x},i) and Langevin dynamics. The training objective is a continuous combination of Fisher divergences:

Et∈U(0,T)Ept(x)\[λ(t)∥∇xlog⁡pt(x)−sθ(x,t)∥22\]\\mathbb{E}\_{t \\in \\mathcal{U}(0, T)}\\mathbb{E}\_{p\_t(\\mathbf{x})}\[\\lambda(t) \\| \\nabla\_\\mathbf{x} \\log p\_t(\\mathbf{x}) - \\mathbf{s}\_\\theta(\\mathbf{x}, t) \\|\_2^2\]

where U(0,T)\\mathcal{U}(0, T) denotes a uniform distribution over the time interval, and λ\\lambda is a positive weighting function. Once we have the score function, we can plug it into the reverse SDE and solve it in order to sample x(0)\\mathbf{x}(0) from the original data distribution p0(x)p\_0(\\mathbf{x}).

> There are a number of options to solve the reverse SDE which we won't analyze here. Make sure to check the original paper or this [excellent blog post by the author](https://yang-song.github.io/blog/2021/score/).

 [![score-based-sde-overview](https://theaisummer.com/static/d75c8ee710db405c3b3f9b912ab8b69a/c1b63/score-based-sde-overview.png "score-based-sde-overview")](https://theaisummer.com/static/d75c8ee710db405c3b3f9b912ab8b69a/663b1/score-based-sde-overview.png)_Overview of score-based generative modeling through SDEs. Source: [Song et al. 2021](https://arxiv.org/abs/2011.13456)_

## Summary

Let’s do a quick sum-up of the main points we learned in this blogpost:

*   Diffusion models work by gradually adding gaussian noise through a series of TT steps into the original image, a process known as diffusion.
    
*   To sample new data, we approximate the reverse diffusion process using a neural network.
    
*   The training of the model is based on maximizing the evidence lower bound (ELBO).
    
*   We can condition the diffusion models on image labels or text embeddings in order to “guide” the diffusion process.
    
*   Cascade and Latent diffusion are two approaches to scale up models to high-resolutions.
    
*   Cascade diffusion models are sequential diffusion models that generate images of increasing resolution.
    
*   Latent diffusion models (like stable diffusion) apply the diffusion process on a smaller latent space for computational efficiency using a variational autoencoder for the up and downsampling.
    
*   Score-based models also apply a sequence of noise perturbations to the original image. But they are trained using score-matching and Langevin dynamics. Nonetheless, they end up in a similar objective.
    
*   The diffusion process can be formulated as an SDE. Solving the reverse SDE allows us to generate new samples.
    

Finally, for more associations between [diffusion models and VAE](https://angusturner.github.io/generative_models/2021/06/29/diffusion-probabilistic-models-I.html) or [AE check out these really nice blogs](https://benanne.github.io/2022/01/31/diffusion.html).

## Cite as

@article{karagiannakos2022diffusionmodels,

    title   \= "Diffusion models: toward state-of-the-art image generation",

    author  \= "Karagiannakos, Sergios, Adaloglou, Nikolaos",

    journal \= "https://theaisummer.com/",

    year    \= "2022",

    howpublished \= {https://theaisummer.com/diffusion\-models/},

  }

## References

\[1\] Sohl-Dickstein, Jascha, et al. [Deep Unsupervised Learning Using Nonequilibrium Thermodynamics](https://arxiv.org/abs/1503.03585). arXiv:1503.03585, arXiv, 18 Nov. 2015

\[2\] Ho, Jonathan, et al. [Denoising Diffusion Probabilistic Models](https://arxiv.org/abs/2006.11239). arXiv:2006.11239, arXiv, 16 Dec. 2020

\[3\] Nichol, Alex, and Prafulla Dhariwal. [Improved Denoising Diffusion Probabilistic Models](https://arxiv.org/abs/2102.09672). arXiv:2102.09672, arXiv, 18 Feb. 2021

\[4\] Dhariwal, Prafulla, and Alex Nichol. [Diffusion Models Beat GANs on Image Synthesis](https://arxiv.org/abs/2105.05233). arXiv:2105.05233, arXiv, 1 June 2021

\[5\] Nichol, Alex, et al. [GLIDE: Towards Photorealistic Image Generation and Editing with Text-Guided Diffusion Models](https://arxiv.org/abs/2112.10741). arXiv:2112.10741, arXiv, 8 Mar. 2022

\[6\] Ho, Jonathan, and Tim Salimans. [Classifier-Free Diffusion Guidance](https://openreview.net/forum?id=qw8AKxfYbI). 2021. openreview.net

\[7\] Ramesh, Aditya, et al. [Hierarchical Text-Conditional Image Generation with CLIP Latents](https://arxiv.org/abs/2204.06125). arXiv:2204.06125, arXiv, 12 Apr. 2022

\[8\] Saharia, Chitwan, et al. [Photorealistic Text-to-Image Diffusion Models with Deep Language Understanding](https://arxiv.org/abs/2205.11487). arXiv:2205.11487, arXiv, 23 May 2022

\[9\] Rombach, Robin, et al. [High-Resolution Image Synthesis with Latent Diffusion Models](https://arxiv.org/abs/2112.10752). arXiv:2112.10752, arXiv, 13 Apr. 2022

\[10\] Ho, Jonathan, et al. [Cascaded Diffusion Models for High Fidelity Image Generation](https://arxiv.org/abs/2106.15282). arXiv:2106.15282, arXiv, 17 Dec. 2021

\[11\] Weng, Lilian. [What Are Diffusion Models?](https://lilianweng.github.io/posts/2021-07-11-diffusion-models/) 11 July 2021

\[12\] O'Connor, Ryan. [Introduction to Diffusion Models for Machine Learning](https://www.assemblyai.com/blog/diffusion-models-for-machine-learning-introduction/) AssemblyAI Blog, 12 May 2022

\[13\] Rogge, Niels and Rasul, Kashif. [The Annotated Diffusion Model](https://huggingface.co/blog/annotated-diffusion) . Hugging Face Blog, 7 June 2022

\[14\] Das, Ayan. “[An Introduction to Diffusion Probabilistic Models.](https://ayandas.me/blog-tut/2021/12/04/diffusion-prob-models.html)” Ayan Das, 4 Dec. 2021

\[15\] Song, Yang, and Stefano Ermon. [Generative Modeling by Estimating Gradients of the Data Distribution](https://arxiv.org/abs/1907.05600). arXiv:1907.05600, arXiv, 10 Oct. 2020

\[16\] Song, Yang, and Stefano Ermon. [Improved Techniques for Training Score-Based Generative Models](https://arxiv.org/abs/2006.09011). arXiv:2006.09011, arXiv, 23 Oct. 2020

\[17\] Song, Yang, et al. [Score-Based Generative Modeling through Stochastic Differential Equations](https://arxiv.org/abs/2011.13456). arXiv:2011.13456, arXiv, 10 Feb. 2021

\[18\] Song, Yang. [Generative Modeling by Estimating Gradients of the Data Distribution](https://yang-song.github.io/blog/2021/score/), 5 May 2021

\[19\] Luo, Calvin. [Understanding Diffusion Models: A Unified Perspective](https://doi.org/10.48550/arXiv.2208.11970). 25 Aug. 2022

_\* Disclosure: Please note that some of the links above might be affiliate links, and at no additional cost to you, we will earn a commission if you decide to make a purchase after clicking through._