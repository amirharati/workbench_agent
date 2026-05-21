Diffusion models are a new class of state-of-the-art generative models that generate diverse high-resolution images. They have already attracted a lot of attention after OpenAI, Nvidia and Google managed to train large-scale models. Example architectures that are based on diffusion models are GLIDE, DALLE-2, Imagen, and the full open-source stable diffusion.

But what is the main principle behind them?

In this blog post, we will dig our way up from the basic principles. There are already a bunch of different diffusion-based architectures. We will focus on the most prominent one, which is the Denoising Diffusion Probabilistic Models (DDPM) as initialized by [Sohl-Dickstein et al](https://arxiv.org/abs/1503.03585) and then proposed by [Ho. et al 2020](https://arxiv.org/abs/2006.11239). Various other approaches will be discussed to a smaller extent such as stable diffusion and score-based models.

> Diffusion models are fundamentally different from all the previous generative methods. Intuitively, they aim to decompose the image generation process (sampling) in many small “denoising” steps.

The intuition behind this is that the model can correct itself over these small steps and gradually produce a good sample. To some extent, this idea of refining the representation has already been used in models like [alphafold](https://youtu.be/nGVFbPKrRWQ?t=1148). But hey, nothing comes at zero-cost. This iterative process makes them slow at sampling, at least compared to [GANs](https://theaisummer.com/gan-computer-vision/).

## Diffusion process

The basic idea behind diffusion models is rather simple. They take the input image $\mathbf{x}_{0}$ and gradually add Gaussian noise to it through a series of $T$ steps. We will call this the forward process. Notably, this is unrelated to the forward pass of a neural network. If you'd like, this part is necessary to generate the targets for our neural network (the image after applying $t < T$ noise steps).

Afterward, a neural network is trained to recover the original data by reversing the noising process. By being able to model the reverse process, we can generate new data. This is the so-called reverse diffusion process or, in general, the sampling process of a generative model.

How? Let’s dive into the math to make it crystal clear.

## Forward diffusion

Diffusion models can be seen as latent variable models. Latent means that we are referring to a hidden continuous feature space. In such a way, they may look similar to [variational autoencoders (VAEs)](https://theaisummer.com/latent-variable-models/).

In practice, they are formulated using a Markov chain of $T$ steps. Here, a Markov chain means that each step only depends on the previous one, which is a mild assumption. Importantly, we are not constrained to using a specific type of neural network, unlike [flow-based models](https://lilianweng.github.io/posts/2018-10-13-flow-models/).

Given a data-point $\textbf{x}_{0}$ sampled from the real data distribution $q \left(\right. x \left.\right)$ ( $\textbf{x}_{0} sim q \left(\right. x \left.\right)$), one can define a forward diffusion process by adding noise. Specifically, at each step of the Markov chain we add Gaussian noise with variance $\beta_{t}$ to $\textbf{x}_{t - 1}$, producing a new latent variable $\textbf{x}_{t}$ with distribution $q \left(\right. \textbf{x}_{t} \mid \textbf{x}_{t - 1} \left.\right)$. This diffusion process can be formulated as follows:

$$
q \left(\right. \mathbf{x}_{t} \mid \mathbf{x}_{t - 1} \left.\right) = \mathcal{N} \left(\right. \mathbf{x}_{t} ; \mathbf{\mathit{\mu}}_{t} = \sqrt{1 - \beta_{t}} \mathbf{x}_{t - 1} , \mathbf{\Sigma}_{t} = \beta_{t} \mathbf{I} \left.\right)
$$

[![Image 1: forward-diffusion](https://theaisummer.com/static/1f5f940d6d3f1e00b3777066f6695331/073e9/forward-diffusion.png)](https://theaisummer.com/static/1f5f940d6d3f1e00b3777066f6695331/073e9/forward-diffusion.png)_Forward diffusion process. Image modified by [Ho et al. 2020](https://arxiv.org/abs/2006.11239)_

Since we are in the multi-dimensional scenario $\textbf{I}$ is the identity matrix, indicating that each dimension has the same standard deviation $\beta_{t}$. Note that $q \left(\right. \mathbf{x}_{t} \mid \mathbf{x}_{t - 1} \left.\right)$ is still a normal distribution, defined by the mean $\mathbf{\mathit{\mu}}$ and the variance $\mathbf{\Sigma}$ where $\mathbf{\mathit{\mu}}_{t} = \sqrt{1 - \beta_{t}} \mathbf{x}_{t - 1}$ and $\mathbf{\Sigma}_{t} = \beta_{t} \mathbf{I}$. $\mathbf{\Sigma}$ will always be a diagonal matrix of variances (here $\beta_{t}$)

Thus, we can go in a closed form from the input data $\mathbf{x}_{0}$ to $\mathbf{x}_{T}$ in a tractable way. Mathematically, this is the posterior probability and is defined as:

$$
q \left(\right. \mathbf{x}_{1 : T} \mid \mathbf{x}_{0} \left.\right) = \prod_{t = 1}^{T} q \left(\right. \mathbf{x}_{t} \mid \mathbf{x}_{t - 1} \left.\right)
$$

The symbol $:$ in $q \left(\right. \mathbf{x}_{1 : T} \left.\right)$ states that we apply $q$ repeatedly from timestep $1$ to $T$. It's also called trajectory.

So far, so good? Well, nah! For timestep $t = 500 < T$ we need to apply $q$ 500 times in order to sample $\mathbf{x}_{t}$. Can't we really do better?

The [reparametrization trick](https://theaisummer.com/latent-variable-models/#reparameterization-trick) provides a magic remedy to this.

### The reparameterization trick: tractable closed-form sampling at any timestep

If we define $\alpha_{t} = 1 - \beta_{t}$, $\left(\overset{ˉ}{\alpha}\right)_{t} = \prod_{s = 0}^{t} \alpha_{s}$ where $\mathbf{\mathit{\epsilon}}_{0} , . . . , \epsilon_{t - 2} , \epsilon_{t - 1} sim \mathcal{N} \left(\right. \textbf{0} , \mathbf{I} \left.\right)$, one can use the [reparameterization trick](https://theaisummer.com/latent-variable-models/#reparameterization-trick) in a recursive manner to prove that:

$$
\mathbf{x}_{t} & = \sqrt{1 - \beta_{t}} \mathbf{x}_{t - 1} + \sqrt{\beta_{t}} \mathbf{\mathit{\epsilon}}_{t - 1} \\ & = \sqrt{\alpha_{t}} \mathbf{x}_{t - 2} + \sqrt{1 - \alpha_{t}} \mathbf{\mathit{\epsilon}}_{t - 2} \\ & = \ldots \\ & = \sqrt{\left(\overset{ˉ}{\alpha}\right)_{t}} \mathbf{x}_{0} + \sqrt{1 - \left(\overset{ˉ}{\alpha}\right)_{t}}
$$

> Note: Since all timestep have the same Gaussian noise we will only use the symbol $\mathbf{\mathit{\epsilon}}$ from now on.

Thus to produce a sample $\mathbf{x}_{t}$ we can use the following distribution:

$$
\mathbf{x}_{t} sim q \left(\right. \mathbf{x}_{t} \mid \mathbf{x}_{0} \left.\right) = \mathcal{N} \left(\right. \mathbf{x}_{t} ; \sqrt{\left(\overset{ˉ}{\alpha}\right)_{t}} \mathbf{x}_{0} , \left(\right. 1 - \left(\overset{ˉ}{\alpha}\right)_{t} \left.\right) \mathbf{I} \left.\right)
$$

Since $\beta_{t}$ is a hyperparameter, we can precompute $\alpha_{t}$ and $\left(\overset{ˉ}{\alpha}\right)_{t}$ for all timesteps. This means that we sample noise at any timestep $t$ and get $\mathbf{x}_{t}$ in one go. Hence, we can sample our latent variable $\mathbf{x}_{t}$ at any arbitrary timestep. This will be our target later on to calculate our tractable objective loss $L_{t}$.

### Variance schedule

The variance parameter $\beta_{t}$ can be fixed to a constant or chosen as a schedule over the $T$ timesteps. In fact, one can define a variance schedule, which can be linear, quadratic, cosine etc. The original DDPM authors utilized a linear schedule increasing from $\beta_{1} = 1 0^{- 4}$ to $\beta_{T} = 0.02$. [Nichol et al. 2021](https://arxiv.org/abs/2102.09672) showed that employing a cosine schedule works even better.

[![Image 2: variance-schedule](https://theaisummer.com/static/074ccf8c4830e7cdf07c68a0f1ef1864/2e195/variance-schedule.png)](https://theaisummer.com/static/074ccf8c4830e7cdf07c68a0f1ef1864/2e195/variance-schedule.png)_Latent samples from linear (top) and cosine (bottom) schedules respectively. Source: [Nichol & Dhariwal 2021](https://arxiv.org/abs/2102.09672)_

## Reverse diffusion

As $T \rightarrow \infty$, the latent $x_{T}$ is nearly an [isotropic](https://math.stackexchange.com/questions/1991961/gaussian-distribution-is-isotropic#:~:text=TLDR%3A%20An%20isotropic%20gaussian%20is,%CE%A3%20is%20the%20covariance%20matrix.) Gaussian distribution. Therefore if we manage to learn the reverse distribution $q \left(\right. \mathbf{x}_{t - 1} \mid \mathbf{x}_{t} \left.\right)$ , we can sample $x_{T}$ from $\mathcal{N} \left(\right. 0 , \mathbf{I} \left.\right)$, run the reverse process and acquire a sample from $q \left(\right. x_{0} \left.\right)$, generating a novel data point from the original data distribution.

The question is how we can model the reverse diffusion process.

### Approximating the reverse process with a neural network

In practical terms, we don't know $q \left(\right. \mathbf{x}_{t - 1} \mid \mathbf{x}_{t} \left.\right)$. It's intractable since statistical estimates of $q \left(\right. \mathbf{x}_{t - 1} \mid \mathbf{x}_{t} \left.\right)$ require computations involving the data distribution.

Instead, we approximate $q \left(\right. \mathbf{x}_{t - 1} \mid \mathbf{x}_{t} \left.\right)$ with a parameterized model $p_{\theta}$ (e.g. a neural network). Since $q \left(\right. \mathbf{x}_{t - 1} \mid \mathbf{x}_{t} \left.\right)$ will also be Gaussian, for small enough $\beta_{t}$, we can choose $p_{\theta}$ to be Gaussian and just parameterize the mean and variance:

$$
p_{\theta} \left(\right. \mathbf{x}_{t - 1} \mid \mathbf{x}_{t} \left.\right) = \mathcal{N} \left(\right. \mathbf{x}_{t - 1} ; \mathbf{\mathit{\mu}}_{\theta} \left(\right. \mathbf{x}_{t} , t \left.\right) , \mathbf{\Sigma}_{\theta} \left(\right. \mathbf{x}_{t} , t \left.\right) \left.\right)
$$

[![Image 3: reverse-diffusion](https://theaisummer.com/static/9bb372bb74034360fe7891d546e3c5b4/01dae/reverse-diffusion.png)](https://theaisummer.com/static/9bb372bb74034360fe7891d546e3c5b4/01dae/reverse-diffusion.png)_Reverse diffusion process. Image modified by [Ho et al. 2020](https://arxiv.org/abs/2006.11239)_

If we apply the reverse formula for all timesteps ($p_{\theta} \left(\right. \mathbf{x}_{0 : T} \left.\right)$, also called trajectory), we can go from $\mathbf{x}_{T}$ to the data distribution:

$$
p_{\theta} \left(\right. \mathbf{x}_{0 : T} \left.\right) = p_{\theta} \left(\right. \mathbf{x}_{T} \left.\right) \prod_{t = 1}^{T} p_{\theta} \left(\right. \mathbf{x}_{t - 1} \mid \mathbf{x}_{t} \left.\right)
$$

By additionally conditioning the model on timestep $t$, it will learn to predict the Gaussian parameters (meaning the mean $\mathbf{\mathit{\mu}}_{\theta} \left(\right. \mathbf{x}_{t} , t \left.\right)$ and the covariance matrix $\mathbf{\Sigma}_{\theta} \left(\right. \mathbf{x}_{t} , t \left.\right)$ ) for each timestep.

But how do we train such a model?

## Training a diffusion model

If we take a step back, we can notice that the combination of $q$ and $p$ is very similar to a variational autoencoder (VAE). Thus, we can train it by optimizing the negative log-likelihood of the training data. After a series of calculations, which we won't analyze here, we can write the evidence lower bound (ELBO) as follows:

$$
l o g p \left(\right. \mathbf{x} \left.\right) \geq & \mathbb{E}_{q \left(\right. x_{1} \mid x_{0} \left.\right)} \left[\right. l o g p_{\theta} \left(\right. \mathbf{x}_{0} \mid \mathbf{x}_{1} \left.\right) \left]\right. - \\ & D_{K L} \left(\right. q \left(\right. \mathbf{x}_{T} \mid \mathbf{x}_{0} \left.\right) \mid \mid p \left(\right. \mathbf{x}_{T} \left.\right) \left.\right) - \\ & \sum_{t = 2}^{T} \mathbb{E}_{q \left(\right. \mathbf{x}_{t} \mid \mathbf{x}_{0} \left.\right)} \left[\right. D_{K L} \left(\right. q \left(\right. \mathbf{x}_{t - 1} \mid \mathbf{x}_{t} , \mathbf{x}_{0} \left.\right) \mid \mid p_{\theta} \left(\right. \mathbf{x}_{t - 1} \mid \mathbf{x}_{t} \left.\right) \left.\right) \left]\right. \\ & = L_{0} - L_{T} - \sum_{t = 2}^{T} L_{t - 1}
$$

Let's analyze these terms:

1.   The $\mathbb{E}_{q \left(\right. x_{1} \mid x_{0} \left.\right)} \left[\right. l o g p_{\theta} \left(\right. \mathbf{x}_{0} \mid \mathbf{x}_{1} \left.\right) \left]\right.$ term can been as a reconstruction term, similar to the one in the ELBO of a variational autoencoder. In[Ho et al 2020](https://arxiv.org/abs/2006.11239) , this term is learned using a separate decoder.

2.   $D_{K L} \left(\right. q \left(\right. \mathbf{x}_{T} \mid \mathbf{x}_{0} \left.\right) \mid \mid p \left(\right. \mathbf{x}_{T} \left.\right) \left.\right)$ shows how close $\mathbf{x}_{T}$ is to the standard Gaussian. Note that the entire term has no trainable parameters so it's ignored during training.

3.   The third term $\sum_{t = 2}^{T} L_{t - 1}$, also referred as $L_{t}$, formulate the difference between the desired denoising steps $p_{\theta} \left(\right. \mathbf{x}_{t - 1} \mid \mathbf{x}_{t} \left.\right) \left.\right)$ and the approximated ones $q \left(\right. \mathbf{x}_{t - 1} \mid \mathbf{x}_{t} , \mathbf{x}_{0} \left.\right)$.

It is evident that through the ELBO, maximizing the likelihood boils down to learning the denoising steps $L_{t}$.

> **Important note**: Even though $q \left(\right. \mathbf{x}_{t - 1} \mid \mathbf{x}_{t} \left.\right)$ is intractable [Sohl-Dickstein et al](https://arxiv.org/abs/1503.03585) illustrated that by additionally conditioning on $\textbf{x}_{0}$ makes it tractable.

Intuitively, a painter (our generative model) needs a reference image ($\textbf{x}_{0}$) to slowly draw (reverse diffusion step $q \left(\right. \mathbf{x}_{t - 1} \mid \mathbf{x}_{t} , \mathbf{x}_{0} \left.\right)$) an image. Thus, we can take a small step backwards, meaning from noise to generate an image, if and only if we have $\textbf{x}_{0}$ as a reference.

In other words, we can sample $\textbf{x}_{t}$ at noise level $t$ conditioned on $\textbf{x}_{0}$. Since $\alpha_{t} = 1 - \beta_{t}$ and $\left(\overset{ˉ}{\alpha}\right)_{t} = \prod_{s = 0}^{t} \alpha_{s}$, we can prove that:

$$
q \left(\right. \mathbf{x}_{t - 1} \mid \mathbf{x}_{t} , \mathbf{x}_{0} \left.\right) & = \mathcal{N} \left(\right. \mathbf{x}_{t - 1} ; \overset{\sim}{\mathbf{\mathit{\mu}}} \left(\right. \mathbf{x}_{t} , \mathbf{x}_{0} \left.\right) , \left(\overset{\sim}{\beta}\right)_{t} \mathbf{I} \left.\right) \\ \left(\overset{\sim}{\beta}\right)_{t} & = \frac{1 - \left(\overset{ˉ}{\alpha}\right)_{t - 1}}{1 - \left(\overset{ˉ}{\alpha}\right)_{t}} \cdot \beta_{t} \\ \left(\overset{\sim}{\mathbf{\mathit{\mu}}}\right)_{t} \left(\right. \mathbf{x}_{t} , \mathbf{x}_{0} \left.\right) & = \frac{\sqrt{\left(\overset{ˉ}{\alpha}\right)_{t - 1}} \beta_{t}}{1 - \left(\overset{ˉ}{\alpha}\right)_{t}} \mathbf{x}_{0} + \frac{\sqrt{\alpha_{t}} \left(\right. 1 - \left(\overset{ˉ}{\alpha}\right)_{t - 1} \left.\right)}{1 - \left(\overset{ˉ}{\alpha}\right)_{t}} \mathbf{x}_{t}
$$

> Note that $\alpha_{t}$ and $\left(\overset{ˉ}{\alpha}\right)_{t}$ depend only on $\beta_{t}$, so they can be precomputed.

This little trick provides us with a fully tractable ELBO. The above property has one more important side effect, as we already saw in the reparameterization trick, we can represent $\mathbf{x}_{0}$ as

$$
\mathbf{x}_{0} = \frac{1}{\sqrt{\left(\overset{ˉ}{\alpha}\right)_{t}}} \left(\right. \mathbf{x}_{t} - \sqrt{1 - \left(\overset{ˉ}{\alpha}\right)_{t}} \mathbf{\mathit{\epsilon}} \left.\right) \left.\right) ,
$$

where $\mathbf{\mathit{\epsilon}} sim \mathcal{N} \left(\right. \textbf{0} , \mathbf{I} \left.\right)$.

By combining the last two equations, each timestep will now have a mean $\left(\overset{\sim}{\mathbf{\mathit{\mu}}}\right)_{t}$ (our target) that only depends on $\mathbf{x}_{t}$:

$$
\left(\overset{\sim}{\mathbf{\mathit{\mu}}}\right)_{t} \left(\right. \mathbf{x}_{t} \left.\right) = \frac{1}{\sqrt{\alpha_{t}}} \left(\right. \mathbf{x}_{t} - \frac{\beta_{t}}{\sqrt{1 - \left(\overset{ˉ}{\alpha}\right)_{t}}} \mathbf{\mathit{\epsilon}} \left.\right) \left.\right)
$$

Therefore we can use a neural network $\epsilon_{\theta} \left(\right. \mathbf{x}_{t} , t \left.\right)$ to approximate $\mathbf{\mathit{\epsilon}}$ and consequently the mean:

$$
\overset{\sim}{\mathbf{\mathit{\mu}}_{\theta}} \left(\right. \mathbf{x}_{t} , t \left.\right) = \frac{1}{\sqrt{\alpha_{t}}} \left(\right. \mathbf{x}_{t} - \frac{\beta_{t}}{\sqrt{1 - \left(\overset{ˉ}{\alpha}\right)_{t}}} \mathbf{\mathit{\epsilon}}_{\theta} \left(\right. \mathbf{x}_{t} , t \left.\right) \left.\right)
$$

Thus, the loss function (the denoising term in the ELBO) can be expressed as:

$$
L_{t} & = \mathbb{E}_{\mathbf{x}_{0} , t , \mathbf{\mathit{\epsilon}}} \left[\right. \frac{1}{2 \mid \mid \mathbf{\Sigma}_{\theta} \left(\right. x_{t} , t \left.\right) \mid \mid_{2}^{2}} \mid \mid \left(\overset{\sim}{\mathbf{\mathit{\mu}}}\right)_{t} - \mathbf{\mathit{\mu}}_{\theta} \left(\right. \mathbf{x}_{t} , t \left.\right) \mid \mid_{2}^{2} \left]\right. \\ & = \mathbb{E}_{\mathbf{x}_{0} , t , \mathbf{\mathit{\epsilon}}} \left[\right. \frac{\beta_{t}^{2}}{2 \alpha_{t} \left(\right. 1 - \left(\overset{ˉ}{\alpha}\right)_{t} \left.\right) \mid \mid \mathbf{\Sigma}_{\theta} \mid \mid_{2}^{2}} \parallel \mathbf{\mathit{\epsilon}}_{t} - \mathbf{\mathit{\epsilon}}_{\theta} \left(\right. \sqrt{\left(\overset{ˉ}{a}\right)_{t}} \mathbf{x}_{0} + \sqrt{1 - \left(\overset{ˉ}{a}\right)_{t}} \mathbf{\mathit{\epsilon}} , t \left.\right) \mid \mid^{2} \left]\right.
$$

This effectively shows us that instead of predicting the mean of the distribution, the model will predict the noise $\mathbf{\mathit{\epsilon}}$ at each timestep $t$.

[Ho et.al 2020](https://arxiv.org/abs/2006.11239) made a few simplifications to the actual loss term as they ignore a weighting term. The simplified version outperforms the full objective:

$$
L_{t}^{\text{simple}} = \mathbb{E}_{\mathbf{x}_{0} , t , \mathbf{\mathit{\epsilon}}} \left[\right. \parallel \mathbf{\mathit{\epsilon}} - \mathbf{\mathit{\epsilon}}_{\theta} \left(\right. \sqrt{\left(\overset{ˉ}{a}\right)_{t}} \mathbf{x}_{0} + \sqrt{1 - \left(\overset{ˉ}{a}\right)_{t}} \mathbf{\mathit{\epsilon}} , t \left.\right) \mid \mid^{2} \left]\right.
$$

The authors found that optimizing the above objective works better than optimizing the original ELBO. The proof for both equations can be found in this [excellent post by Lillian Weng](https://lilianweng.github.io/posts/2021-07-11-diffusion-models/#reverse-diffusion-process) or in[Luo et al. 2022](https://arxiv.org/abs/2208.11970).

Additionally, [Ho et. al 2020](https://arxiv.org/abs/2006.11239) decide to keep the variance fixed and have the network learn only the mean. This was later improved by [Nichol et al. 2021](https://arxiv.org/abs/2102.09672), who decide to let the network learn the covariance matrix $\left(\right. \mathbf{\Sigma} \left.\right)$ as well (by modifying $L_{t}^{\text{simple}}$ ), achieving better results.

[![Image 4: training-sampling-ddpm](https://theaisummer.com/static/411d503d7233bc525088aa275f30f74e/c1b63/training-sampling-ddpm.png)](https://theaisummer.com/static/411d503d7233bc525088aa275f30f74e/4fa52/training-sampling-ddpm.png)_Training and sampling algorithms of DDPMs. Source: [Ho et al. 2020](https://arxiv.org/abs/2006.11239)_

## Architecture

One thing that we haven't mentioned so far is what the model's architecture looks like. Notice that the model's input and output should be of the same size.

To this end, [Ho et al.](https://arxiv.org/abs/2006.11239) employed a U-Net. If you are unfamiliar with U-Nets, feel free to check out our past article on the [major U-Net architectures](https://theaisummer.com/unet-architectures/). In a few words, a U-Net is a symmetric architecture with input and output of the same spatial size that uses [skip connections](https://theaisummer.com/skip-connections/) between encoder and decoder blocks of corresponding feature dimension. Usually, the input image is first downsampled and then upsampled until reaching its initial size.

In the original implementation of DDPMs, the U-Net consists of Wide[ResNet blocks](https://theaisummer.com/skip-connections/#resnet-skip-connections-via-addition), [group normalization](https://theaisummer.com/normalization/#group-normalization-2018) as well as [self-attention](https://theaisummer.com/attention/) blocks.

The diffusion timestep $t$ is specified by adding a sinusoidal [position embedding](https://theaisummer.com/positional-embeddings/) into each residual block. For more details, feel free to visit the [official GitHub repository](https://github.com/hojonathanho/diffusion). For a detailed implementation of the diffusion model, check out this awesome[post by Hugging Face](https://huggingface.co/blog/annotated-diffusion).

[![Image 5: unet](https://theaisummer.com/static/8e35326846f64b64741e92d6ce4cf8b6/58213/unet.png)](https://theaisummer.com/static/8e35326846f64b64741e92d6ce4cf8b6/58213/unet.png)_The U-Net architecture. Source: [Ronneberger et al.](https://arxiv.org/abs/1505.04597)_

## Conditional Image Generation: Guided Diffusion

A crucial aspect of image generation is conditioning the sampling process to manipulate the generated samples. Here, this is also referred to as guided diffusion.

There have even been methods that incorporate image embeddings into the diffusion in order to "guide" the generation. Mathematically, guidance refers to conditioning a prior data distribution $p \left(\right. \textbf{x} \left.\right)$ with a condition $y$, i.e. the class label or an image/text embedding, resulting in $p \left(\right. \textbf{x} \mid y \left.\right)$.

To turn a diffusion model $p_{\theta}$ into a conditional diffusion model, we can add conditioning information $y$ at each diffusion step.

$$
p_{\theta} \left(\right. \mathbf{x}_{0 : T} \mid y \left.\right) = p_{\theta} \left(\right. \mathbf{x}_{T} \left.\right) \prod_{t = 1}^{T} p_{\theta} \left(\right. \mathbf{x}_{t - 1} \mid \mathbf{x}_{t} , y \left.\right)
$$

The fact that the conditioning is being seen at each timestep may be a good justification for the excellent samples from a text prompt.

In general, guided diffusion models aim to learn $\nabla log ⁡ p_{\theta} \left(\right. \mathbf{x}_{t} \mid y \left.\right)$. So using the Bayes rule, we can write:

$$
\nabla_{\textbf{x}_{t}} log ⁡ p_{\theta} \left(\right. \mathbf{x}_{t} \mid y \left.\right) & = \nabla_{\textbf{x}_{t}} log ⁡ \left(\right. \frac{p_{\theta} \left(\right. y \mid \mathbf{x}_{t} \left.\right) p_{\theta} \left(\right. \mathbf{x}_{t} \left.\right)}{p_{\theta} \left(\right. y \left.\right)} \left.\right) \\ & = \nabla_{\textbf{x}_{t}} l o g p_{\theta} \left(\right. \mathbf{x}_{t} \left.\right) + \nabla_{\textbf{x}_{t}} l o g \left(\right. p_{\theta} \left(\right. y \mid \mathbf{x}_{t} \left.\right) \left.\right)
$$

$p_{\theta} \left(\right. y \left.\right)$ is removed since the gradient operator $\nabla_{\textbf{x}_{t}}$ refers only to $\textbf{x}_{t}$, so no gradient for $y$. Moreover remember that $log ⁡ \left(\right. a b \left.\right) = log ⁡ \left(\right. a \left.\right) + log ⁡ \left(\right. b \left.\right)$.

And by adding a guidance scalar term $s$, we have:

$$
\nabla log ⁡ p_{\theta} \left(\right. \mathbf{x}_{t} \mid y \left.\right) = \nabla log ⁡ p_{\theta} \left(\right. \mathbf{x}_{t} \left.\right) + s \cdot \nabla log ⁡ \left(\right. p_{\theta} \left(\right. y \mid \mathbf{x}_{t} \left.\right) \left.\right)
$$

Using this formulation, let's make a distinction between classifier and classifier-free guidance. Next, we will present two family of methods aiming at injecting label information.

### Classifier guidance

[Sohl-Dickstein et al](https://arxiv.org/abs/1503.03585). and later [Dhariwal and Nichol](https://arxiv.org/abs/2105.05233) showed that we can use a second model, a classifier $f_{\phi} \left(\right. y \mid \mathbf{x}_{t} , t \left.\right)$, to guide the diffusion toward the target class $y$ during training. To achieve that, we can train a classifier $f_{\phi} \left(\right. y \mid \mathbf{x}_{t} , t \left.\right)$ on the noisy image $\mathbf{x}_{t}$ to predict its class $y$. Then we can use the gradients $\nabla log ⁡ \left(\right. f_{\phi} \left(\right. y \mid \mathbf{x}_{t} \left.\right) \left.\right)$ to guide the diffusion. How?

We can build a class-conditional diffusion model with mean $\mu_{\theta} \left(\right. \mathbf{x}_{t} \mid y \left.\right)$ and variance $\mathbf{\Sigma}_{\theta} \left(\right. \mathbf{x}_{t} \mid y \left.\right)$.

Since $p_{\theta} sim \mathcal{N} \left(\right. \mu_{\theta} , \Sigma_{\theta} \left.\right)$, we can show using the guidance formulation from the previous section that the mean is perturbed by the gradients of $log ⁡ f_{\phi} \left(\right. y \mid \mathbf{x}_{t} \left.\right)$ of class $y$, resulting in:

$$
\hat{\mu} \left(\right. \mathbf{x}_{t} \mid y \left.\right) = \mu_{\theta} \left(\right. \mathbf{x}_{t} \mid y \left.\right) + s \cdot \mathbf{\Sigma}_{\theta} \left(\right. \mathbf{x}_{t} \mid y \left.\right) \nabla_{\mathbf{x}_{t}} l o g f_{\phi} \left(\right. y \mid \mathbf{x}_{t} , t \left.\right)
$$

In the famous [GLIDE paper by Nichol et al](https://arxiv.org/abs/2112.10741), the authors expanded on this idea and use [CLIP embeddings](https://theaisummer.com/vision-language-models/#clip) to guide the diffusion. CLIP as proposed by [Saharia et al.](https://arxiv.org/abs/2205.11487), consists of an image encoder $g$ and a text encoder $h$. It produces an image and text embeddings $g \left(\right. \mathbf{x}_{t} \left.\right)$ and $h \left(\right. c \left.\right)$, respectively, wherein $c$ is the text caption.

Therefore, we can perturb the gradients with their dot product:

$$
\hat{\mu} \left(\right. \mathbf{x}_{t} \mid c \left.\right) = \mu \left(\right. \mathbf{x}_{t} \mid c \left.\right) + s \cdot \mathbf{\Sigma}_{\theta} \left(\right. \mathbf{x}_{t} \mid c \left.\right) \nabla_{\mathbf{x}_{t}} g \left(\right. \mathbf{x}_{t} \left.\right) \cdot h \left(\right. c \left.\right)
$$

As a result, they manage to "steer" the generation process toward a user-defined text caption.

[![Image 6: classifier-guidance](https://theaisummer.com/static/671ddf9d25d76db9371deac995a52642/1c1a4/classifier-guidance.png)](https://theaisummer.com/static/671ddf9d25d76db9371deac995a52642/1c1a4/classifier-guidance.png)_Algorithm of classifier guided diffusion sampling. Source: [Dhariwal & Nichol 2021](https://arxiv.org/abs/2105.05233)_

### Classifier-free guidance

Using the same formulation as before we can define a classifier-free guided diffusion model as:

$$
\nabla log ⁡ p \left(\right. \mathbf{x}_{t} \mid y \left.\right) = s \cdot \nabla l o g \left(\right. p \left(\right. \mathbf{x}_{t} \mid y \left.\right) \left.\right) + \left(\right. 1 - s \left.\right) \cdot \nabla l o g p \left(\right. \mathbf{x}_{t} \left.\right)
$$

Guidance can be achieved without a second classifier model as proposed by [Ho & Salimans](https://openreview.net/forum?id=qw8AKxfYbI). Instead of training a separate classifier, the authors trained a conditional diffusion model $\mathbf{\mathit{\epsilon}}_{\theta} \left(\right. \mathbf{x}_{t} \mid y \left.\right)$ together with an unconditional model $\mathbf{\mathit{\epsilon}}_{\theta} \left(\right. \mathbf{x}_{t} \mid 0 \left.\right)$. In fact, they use the exact same neural network. During training, they randomly set the class $y$ to $0$, so that the model is exposed to both the conditional and unconditional setup:

$$
\left(\hat{\mathbf{\mathit{\epsilon}}}\right)_{\theta} \left(\right. \mathbf{x}_{t} \mid y \left.\right) & = s \cdot \mathbf{\mathit{\epsilon}}_{\theta} \left(\right. \mathbf{x}_{t} \mid y \left.\right) + \left(\right. 1 - s \left.\right) \cdot \mathbf{\mathit{\epsilon}}_{\theta} \left(\right. \mathbf{x}_{t} \mid 0 \left.\right) \\ & = \mathbf{\mathit{\epsilon}}_{\theta} \left(\right. \mathbf{x}_{t} \mid 0 \left.\right) + s \cdot \left(\right. \mathbf{\mathit{\epsilon}}_{\theta} \left(\right. \mathbf{x}_{t} \mid y \left.\right) - \mathbf{\mathit{\epsilon}}_{\theta} \left(\right. \mathbf{x}_{t} \mid 0 \left.\right) \left.\right)
$$

> Note that this can also be used to "inject" text embeddings as we showed in classifier guidance.

This admittedly "weird" process has two major advantages:

*   It uses only a single model to guide the diffusion.

*   It simplifies guidance when conditioning on information that is difficult to predict with a classifier (such as text embeddings).

Imagen as proposed by [Saharia et al](https://arxiv.org/abs/2205.11487). relies heavily on classifier-free guidance, as they find that it is a key contributor to generating samples with strong image-text alignment. For more info on the approach of Imagen check out this video from AI Coffee Break with Letitia:

[Video 5](https://www.youtube.com/watch?v=xqDeAz0U-R4)
## Scaling up diffusion models

You might be asking what is the problem with these models. Well, it's computationally very expensive to scale these U-nets into high-resolution images. This brings us to two methods for scaling up diffusion models to higher resolutions: cascade diffusion models and latent diffusion models.

### Cascade diffusion models

[Ho et al. 2021](https://arxiv.org/abs/2106.15282) introduced cascade diffusion models in an effort to produce high-fidelity images. A cascade diffusion model consists of a pipeline of many sequential diffusion models that generate images of increasing resolution. Each model generates a sample with superior quality than the previous one by successively upsampling the image and adding higher resolution details. To generate an image, we sample sequentially from each diffusion model.

[![Image 7: cascade-diffusion](https://theaisummer.com/static/2abb7ee11f7295d634fabf8820156d8c/eba85/cascade-diffusion.png)](https://theaisummer.com/static/2abb7ee11f7295d634fabf8820156d8c/eba85/cascade-diffusion.png)_Cascade diffusion model pipeline. Source: Ho & Saharia et al._

To acquire good results with cascaded architectures, strong data augmentations on the input of each super-resolution model are crucial. Why? Because it alleviates compounding error from the previous cascaded models, as well as due to a train-test mismatch.

It was found that gaussian blurring is a critical transformation toward achieving high fidelity. They refer to this technique as conditioning augmentation.

### Stable diffusion: Latent diffusion models

Latent diffusion models are based on a rather simple idea: instead of applying the diffusion process directly on a high-dimensional input, we project the input into a smaller latent space and apply the diffusion there.

In more detail, [Rombach et al](https://arxiv.org/abs/2112.10752). proposed to use an encoder network to encode the input into a latent representation i.e. $\mathbf{z}_{t} = g \left(\right. \mathbf{x}_{t} \left.\right)$. The intuition behind this decision is to lower the computational demands of training diffusion models by processing the input in a lower dimensional space. Afterward, a standard diffusion model (U-Net) is applied to generate new data, which are upsampled by a decoder network.

If the loss for a typical diffusion model (DM) is formulated as:

$$
L_{D M} = \mathbb{E}_{\mathbf{x} , t , \mathbf{\mathit{\epsilon}}} \left[\right. \parallel \mathbf{\mathit{\epsilon}} - \mathbf{\mathit{\epsilon}}_{\theta} \left(\right. \mathbf{x}_{t} , t \left.\right) \mid \mid^{2} \left]\right.
$$

then given an encoder $\mathcal{E}$ and a latent representation $z$, the loss for a latent diffusion model (LDM) is:

$$
L_{L D M} = \mathbb{E}_{\mathcal{E} \left(\right. \mathbf{x} \left.\right) , t , \mathbf{\mathit{\epsilon}}} \left[\right. \parallel \mathbf{\mathit{\epsilon}} - \mathbf{\mathit{\epsilon}}_{\theta} \left(\right. \mathbf{z}_{t} , t \left.\right) \mid \mid^{2} \left]\right.
$$

[![Image 8: stable-diffusion](https://theaisummer.com/static/59e73a1bfb457aa0665b14ad9b914cbc/c1b63/stable-diffusion.png)](https://theaisummer.com/static/59e73a1bfb457aa0665b14ad9b914cbc/0d0e4/stable-diffusion.png)_Latent diffusion models. Source: [Rombach et al](https://arxiv.org/abs/2112.10752)_

For more information check out this video:

[Video 6](https://www.youtube.com/watch?v=ltLNYA3lWAQ)
## Score-based generative models

Around the same time as the DDPM paper, [Song and Ermon](https://arxiv.org/abs/1907.05600) proposed a different type of generative model that appears to have many similarities with diffusion models. Score-based models tackle generative learning using score matching and Langevin dynamics.

> [Score-matching](https://www.jmlr.org/papers/v6/hyvarinen05a.html) refers to the process of modeling the gradient of the log probability density function, also known as the score function. [Langevin dynamics](https://en.wikipedia.org/wiki/Langevin_dynamics) is an iterative process that can draw samples from a distribution using only its score function.

$$
\mathbf{x}_{t} = \mathbf{x}_{t - 1} + \frac{\delta}{2} \nabla_{\mathbf{x}} log ⁡ p \left(\right. \mathbf{x}_{t - 1} \left.\right) + \sqrt{\delta} \mathbf{\mathit{\epsilon}} , \textrm{ }\text{where}\textrm{ } \mathbf{\mathit{\epsilon}} sim \mathcal{N} \left(\right. 0 , \mathbf{I} \left.\right)
$$

where $\delta$ is the step size.

Suppose that we have a probability density $p \left(\right. x \left.\right)$ and that we define the score function to be $\nabla_{x} log ⁡ p \left(\right. x \left.\right)$. We can then train a neural network $s_{\theta}$ to estimate $\nabla_{x} log ⁡ p \left(\right. x \left.\right)$ without estimating $p \left(\right. x \left.\right)$ first. The training objective can be formulated as follows:

$$
\mathbb{E}_{p \left(\right. \mathbf{x} \left.\right)} \left[\right. \parallel \nabla_{\mathbf{x}} log ⁡ p \left(\right. \mathbf{x} \left.\right) - \mathbf{s}_{\theta} \left(\right. \mathbf{x} \left.\right) \parallel_{2}^{2} \left]\right. = \int p \left(\right. \mathbf{x} \left.\right) \parallel \nabla_{\mathbf{x}} log ⁡ p \left(\right. \mathbf{x} \left.\right) - \mathbf{s}_{\theta} \left(\right. \mathbf{x} \left.\right) \parallel_{2}^{2} d \mathbf{x}
$$

Then by using Langevin dynamics, we can directly sample from $p \left(\right. x \left.\right)$ using the approximated score function.

> In case you missed it, guided diffusion models use this formulation of score-based models as they learn directly $\nabla_{x} log ⁡ p \left(\right. x \left.\right)$. Of course, they don’t rely on Langevin dynamics.

### Adding noise to score-based models: Noise Conditional Score Networks (NCSN)

> The problem so far: the estimated score functions are usually inaccurate in low-density regions, where few data points are available. As a result, the quality of data sampled using Langevin dynamics is **not** good.

Their solution was to perturb the data points with noise and train score-based models on the noisy data points instead. As a matter of fact, they used multiple scales of Gaussian noise perturbations.

Thus, adding noise is the key to make both DDPM and score based models work.

[![Image 9: score-based](https://theaisummer.com/static/dc655bf322dddc80d5596899e053c5e6/c1b63/score-based.png)](https://theaisummer.com/static/dc655bf322dddc80d5596899e053c5e6/a878e/score-based.png)_Score-based generative modeling with score matching + Langevin dynamics. Source: [Generative Modeling by Estimating Gradients of the Data Distribution](https://yang-song.github.io/blog/2021/score/)_

Mathematically, given the data distribution $p \left(\right. x \left.\right)$, we perturb with Gaussian noise $\mathcal{N} \left(\right. \textbf{0} , \sigma_{i}^{2} I \left.\right)$ where $i = 1 , 2 , \hdots \textrm{ } , L$ to obtain a noise-perturbed distribution:

$$
p_{\sigma_{i}} \left(\right. \mathbf{x} \left.\right) = \int p \left(\right. \mathbf{y} \left.\right) \mathcal{N} \left(\right. \mathbf{x} ; \mathbf{y} , \sigma_{i}^{2} I \left.\right) d \mathbf{y}
$$

Then we train a network $s_{\theta} \left(\right. \mathbf{x} , i \left.\right)$, known as Noise Conditional Score-Based Network (NCSN) to estimate the score function $\nabla_{\mathbf{x}} log ⁡ d_{\sigma_{i}} \left(\right. \mathbf{x} \left.\right)$. The training objective is a weighted sum of [Fisher divergences](https://en.wikipedia.org/wiki/Fisher_information_metric) for all noise scales.

$$
\sum_{i = 1}^{L} \lambda \left(\right. i \left.\right) \mathbb{E}_{p_{\sigma_{i}} \left(\right. \mathbf{x} \left.\right)} \left[\right. \parallel \nabla_{\mathbf{x}} log ⁡ p_{\sigma_{i}} \left(\right. \mathbf{x} \left.\right) - \mathbf{s}_{\theta} \left(\right. \mathbf{x} , i \left.\right) \parallel_{2}^{2} \left]\right.
$$

### Score-based generative modeling through stochastic differential equations (SDE)

[Song et al. 2021](https://arxiv.org/abs/2011.13456) explored the connection of score-based models with diffusion models. In an effort to encapsulate both NSCNs and DDPMs under the same umbrella, they proposed the following:

Instead of perturbing data with a finite number of noise distributions, we use a continuum of distributions that evolve over time according to a diffusion process. This process is modeled by a prescribed stochastic differential equation (SDE) that does not depend on the data and has no trainable parameters. By reversing the process, we can generate new samples.

[![Image 10: score-sde](https://theaisummer.com/static/d007d60f773b61f4585cbec3869490d5/c1b63/score-sde.png)](https://theaisummer.com/static/d007d60f773b61f4585cbec3869490d5/a878e/score-sde.png)_Score-based generative modeling through stochastic differential equations (SDE). Source: [Song et al. 2021](https://arxiv.org/abs/2011.13456)_

We can define the diffusion process $\left{\right. \mathbf{x} \left(\right. t \left.\right) \left.\right}_{t \in \left[\right. 0 , T \left]\right.}$ as an SDE in the following form:

$$
d \mathbf{x} = \mathbf{f} \left(\right. \mathbf{x} , t \left.\right) d t + g \left(\right. t \left.\right) d \mathbf{w}
$$

where $\mathbf{w}$ is the [Wiener process](https://en.wikipedia.org/wiki/Wiener_process) (a.k.a., [Brownian motion](https://en.wikipedia.org/wiki/Brownian_motion)), $\mathbf{f} \left(\right. \cdot , t \left.\right)$ is a vector-valued function called the drift coefficient of $\mathbf{x} \left(\right. t \left.\right)$, and $g \left(\right. \cdot \left.\right)$ is a scalar function known as the diffusion coefficient of $\mathbf{x} \left(\right. t \left.\right)$. Note that the SDE typically has a unique strong solution.

> To make sense of why we use an SDE, here is a tip: the SDE is inspired by the Brownian motion, in which a number of particles move randomly inside a medium. This randomness of the particles' motion models the continuous noise perturbations on the data.

After perturbing the original data distribution for a sufficiently long time, the perturbed distribution becomes close to a tractable noise distribution.

To generate new samples, we need to reverse the diffusion process. The SDE was chosen to have a corresponding reverse SDE in closed form:

$$
d \mathbf{x} = \left[\right. \mathbf{f} \left(\right. \mathbf{x} , t \left.\right) - g^{2} \left(\right. t \left.\right) \nabla_{\mathbf{x}} log ⁡ p_{t} \left(\right. \mathbf{x} \left.\right) \left]\right. d t + g \left(\right. t \left.\right) d \mathbf{w}
$$

To compute the reverse SDE, we need to estimate the score function $\nabla_{\mathbf{x}} log ⁡ p_{t} \left(\right. \mathbf{x} \left.\right)$. This is done using a score-based model $s_{\theta} \left(\right. \mathbf{x} , i \left.\right)$ and Langevin dynamics. The training objective is a continuous combination of Fisher divergences:

$$
\mathbb{E}_{t \in \mathcal{U} \left(\right. 0 , T \left.\right)} \mathbb{E}_{p_{t} \left(\right. \mathbf{x} \left.\right)} \left[\right. \lambda \left(\right. t \left.\right) \parallel \nabla_{\mathbf{x}} log ⁡ p_{t} \left(\right. \mathbf{x} \left.\right) - \mathbf{s}_{\theta} \left(\right. \mathbf{x} , t \left.\right) \parallel_{2}^{2} \left]\right.
$$

where $\mathcal{U} \left(\right. 0 , T \left.\right)$ denotes a uniform distribution over the time interval, and $\lambda$ is a positive weighting function. Once we have the score function, we can plug it into the reverse SDE and solve it in order to sample $\mathbf{x} \left(\right. 0 \left.\right)$ from the original data distribution $p_{0} \left(\right. \mathbf{x} \left.\right)$.

> There are a number of options to solve the reverse SDE which we won't analyze here. Make sure to check the original paper or this[excellent blog post by the author](https://yang-song.github.io/blog/2021/score/).

[![Image 11: score-based-sde-overview](https://theaisummer.com/static/d75c8ee710db405c3b3f9b912ab8b69a/c1b63/score-based-sde-overview.png)](https://theaisummer.com/static/d75c8ee710db405c3b3f9b912ab8b69a/663b1/score-based-sde-overview.png)_Overview of score-based generative modeling through SDEs. Source: [Song et al. 2021](https://arxiv.org/abs/2011.13456)_

## Summary

Let’s do a quick sum-up of the main points we learned in this blogpost:

*   Diffusion models work by gradually adding gaussian noise through a series of $T$ steps into the original image, a process known as diffusion.

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

title = "Diffusion models: toward state-of-the-art image generation",

author = "Karagiannakos, Sergios, Adaloglou, Nikolaos",

journal = "https://theaisummer.com/",

year = "2022",

howpublished = {https://theaisummer.com/diffusion-models/},

}

## References

[1] Sohl-Dickstein, Jascha, et al.[Deep Unsupervised Learning Using Nonequilibrium Thermodynamics](https://arxiv.org/abs/1503.03585). arXiv:1503.03585, arXiv, 18 Nov. 2015

[2] Ho, Jonathan, et al. [Denoising Diffusion Probabilistic Models](https://arxiv.org/abs/2006.11239). arXiv:2006.11239, arXiv, 16 Dec. 2020

[3] Nichol, Alex, and Prafulla Dhariwal.[Improved Denoising Diffusion Probabilistic Models](https://arxiv.org/abs/2102.09672). arXiv:2102.09672, arXiv, 18 Feb. 2021

[4] Dhariwal, Prafulla, and Alex Nichol.[Diffusion Models Beat GANs on Image Synthesis](https://arxiv.org/abs/2105.05233). arXiv:2105.05233, arXiv, 1 June 2021

[5] Nichol, Alex, et al. [GLIDE: Towards Photorealistic Image Generation and Editing with Text-Guided Diffusion Models](https://arxiv.org/abs/2112.10741). arXiv:2112.10741, arXiv, 8 Mar. 2022

[6] Ho, Jonathan, and Tim Salimans.[Classifier-Free Diffusion Guidance](https://openreview.net/forum?id=qw8AKxfYbI). 2021. openreview.net

[7] Ramesh, Aditya, et al. [Hierarchical Text-Conditional Image Generation with CLIP Latents](https://arxiv.org/abs/2204.06125). arXiv:2204.06125, arXiv, 12 Apr. 2022

[8] Saharia, Chitwan, et al. [Photorealistic Text-to-Image Diffusion Models with Deep Language Understanding](https://arxiv.org/abs/2205.11487). arXiv:2205.11487, arXiv, 23 May 2022

[9] Rombach, Robin, et al. [High-Resolution Image Synthesis with Latent Diffusion Models](https://arxiv.org/abs/2112.10752). arXiv:2112.10752, arXiv, 13 Apr. 2022

[10] Ho, Jonathan, et al. [Cascaded Diffusion Models for High Fidelity Image Generation](https://arxiv.org/abs/2106.15282). arXiv:2106.15282, arXiv, 17 Dec. 2021

[11] Weng, Lilian. [What Are Diffusion Models?](https://lilianweng.github.io/posts/2021-07-11-diffusion-models/) 11 July 2021

[12] O'Connor, Ryan. [Introduction to Diffusion Models for Machine Learning](https://www.assemblyai.com/blog/diffusion-models-for-machine-learning-introduction/) AssemblyAI Blog, 12 May 2022

[13] Rogge, Niels and Rasul, Kashif. [The Annotated Diffusion Model](https://huggingface.co/blog/annotated-diffusion) . Hugging Face Blog, 7 June 2022

[14] Das, Ayan. “[An Introduction to Diffusion Probabilistic Models.](https://ayandas.me/blog-tut/2021/12/04/diffusion-prob-models.html)” Ayan Das, 4 Dec. 2021

[15] Song, Yang, and Stefano Ermon. [Generative Modeling by Estimating Gradients of the Data Distribution](https://arxiv.org/abs/1907.05600). arXiv:1907.05600, arXiv, 10 Oct. 2020

[16] Song, Yang, and Stefano Ermon. [Improved Techniques for Training Score-Based Generative Models](https://arxiv.org/abs/2006.09011). arXiv:2006.09011, arXiv, 23 Oct. 2020

[17] Song, Yang, et al. [Score-Based Generative Modeling through Stochastic Differential Equations](https://arxiv.org/abs/2011.13456). arXiv:2011.13456, arXiv, 10 Feb. 2021

[18] Song, Yang. [Generative Modeling by Estimating Gradients of the Data Distribution](https://yang-song.github.io/blog/2021/score/), 5 May 2021

[19] Luo, Calvin.[Understanding Diffusion Models: A Unified Perspective](https://doi.org/10.48550/arXiv.2208.11970). 25 Aug. 2022

_* Disclosure: Please note that some of the links above might be affiliate links, and at no additional cost to you, we will earn a commission if you decide to make a purchase after clicking through._