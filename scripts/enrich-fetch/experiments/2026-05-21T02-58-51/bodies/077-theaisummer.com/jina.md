×
Start Here
Learn AI
Deep Learning Fundamentals
Advanced Deep Learning
AI Software Engineering
Books & Courses
Deep Learning in Production Book
Introduction to Deep Learning Interactive Course
Representation Learning MSc course 2023
Deep Reinforcement Learning Free Course
GANs in Computer Vision Free Ebook
Projects
Medical Zoo
Self Attention CV
Resources
About
Contact
Search
Support us

📖 Check out our Introduction to Deep Learning & Neural Networks course 📖

Learn more
How diffusion models work: the math from scratch
Sergios Karagiannakos,Nikolas Adaloglouon2022-09-29·14 mins
Generative Learning
Computer Vision

Diffusion models are a new class of state-of-the-art generative models that generate diverse high-resolution images. They have already attracted a lot of attention after OpenAI, Nvidia and Google managed to train large-scale models. Example architectures that are based on diffusion models are GLIDE, DALLE-2, Imagen, and the full open-source stable diffusion.

But what is the main principle behind them?

In this blog post, we will dig our way up from the basic principles. There are already a bunch of different diffusion-based architectures. We will focus on the most prominent one, which is the Denoising Diffusion Probabilistic Models (DDPM) as initialized by Sohl-Dickstein et al and then proposed by Ho. et al 2020. Various other approaches will be discussed to a smaller extent such as stable diffusion and score-based models.

Diffusion models are fundamentally different from all the previous generative methods. Intuitively, they aim to decompose the image generation process (sampling) in many small “denoising” steps.

The intuition behind this is that the model can correct itself over these small steps and gradually produce a good sample. To some extent, this idea of refining the representation has already been used in models like alphafold. But hey, nothing comes at zero-cost. This iterative process makes them slow at sampling, at least compared to GANs.

Diffusion process

The basic idea behind diffusion models is rather simple. They take the input image 
𝑥
0
x
0
	​

 and gradually add Gaussian noise to it through a series of 
𝑇
T steps. We will call this the forward process. Notably, this is unrelated to the forward pass of a neural network. If you'd like, this part is necessary to generate the targets for our neural network (the image after applying 
𝑡
<
𝑇
t<T noise steps).

Afterward, a neural network is trained to recover the original data by reversing the noising process. By being able to model the reverse process, we can generate new data. This is the so-called reverse diffusion process or, in general, the sampling process of a generative model.

How? Let’s dive into the math to make it crystal clear.

Forward diffusion

Diffusion models can be seen as latent variable models. Latent means that we are referring to a hidden continuous feature space. In such a way, they may look similar to variational autoencoders (VAEs).

In practice, they are formulated using a Markov chain of 
𝑇
T steps. Here, a Markov chain means that each step only depends on the previous one, which is a mild assumption. Importantly, we are not constrained to using a specific type of neural network, unlike flow-based models.

Given a data-point 
x
0
x
0
	​

 sampled from the real data distribution 
𝑞
(
𝑥
)
q(x) ( 
x
0
∼
𝑞
(
𝑥
)
x
0
	​

∼q(x)), one can define a forward diffusion process by adding noise. Specifically, at each step of the Markov chain we add Gaussian noise with variance 
𝛽
𝑡
β
t
	​

 to 
x
𝑡
−
1
x
t−1
	​

, producing a new latent variable 
x
𝑡
x
t
	​

 with distribution 
𝑞
(
x
𝑡
∣
x
𝑡
−
1
)
q(x
t
	​

∣x
t−1
	​

). This diffusion process can be formulated as follows:

𝑞
(
𝑥
𝑡
∣
𝑥
𝑡
−
1
)
=
𝑁
(
𝑥
𝑡
;
𝜇
𝑡
=
1
−
𝛽
𝑡
𝑥
𝑡
−
1
,
𝛴
𝑡
=
𝛽
𝑡
𝐼
)
q(x
t
	​

∣x
t−1
	​

)=N(x
t
	​

;μ
t
	​

=
1−β
t
	​

	​

x
t−1
	​

,Σ
t
	​

=β
t
	​

I)

Forward diffusion process. Image modified by Ho et al. 2020

Since we are in the multi-dimensional scenario 
I
I is the identity matrix, indicating that each dimension has the same standard deviation 
𝛽
𝑡
β
t
	​

. Note that 
𝑞
(
𝑥
𝑡
∣
𝑥
𝑡
−
1
)
q(x
t
	​

∣x
t−1
	​

) is still a normal distribution, defined by the mean 
𝜇
μ and the variance 
𝛴
Σ where 
𝜇
𝑡
=
1
−
𝛽
𝑡
𝑥
𝑡
−
1
μ
t
	​

=
1−β
t
	​

	​

x
t−1
	​

 and 
𝛴
𝑡
=
𝛽
𝑡
𝐼
Σ
t
	​

=β
t
	​

I. 
𝛴
Σ will always be a diagonal matrix of variances (here 
𝛽
𝑡
β
t
	​

)

Thus, we can go in a closed form from the input data 
𝑥
0
x
0
	​

 to 
𝑥
𝑇
x
T
	​

 in a tractable way. Mathematically, this is the posterior probability and is defined as:

𝑞
(
𝑥
1
:
𝑇
∣
𝑥
0
)
=
∏
𝑡
=
1
𝑇
𝑞
(
𝑥
𝑡
∣
𝑥
𝑡
−
1
)
q(x
1:T
	​

∣x
0
	​

)=
t=1
∏
T
	​

q(x
t
	​

∣x
t−1
	​

)

The symbol 
:
: in 
𝑞
(
𝑥
1
:
𝑇
)
q(x
1:T
	​

) states that we apply 
𝑞
q repeatedly from timestep 
1
1 to 
𝑇
T. It's also called trajectory.

So far, so good? Well, nah! For timestep 
𝑡
=
500
<
𝑇
t=500<T we need to apply 
𝑞
q 500 times in order to sample 
𝑥
𝑡
x
t
	​

. Can't we really do better?

The reparametrization trick provides a magic remedy to this.

The reparameterization trick: tractable closed-form sampling at any timestep

If we define 
𝛼
𝑡
=
1
−
𝛽
𝑡
α
t
	​

=1−β
t
	​

, 
𝛼
ˉ
𝑡
=
∏
𝑠
=
0
𝑡
𝛼
𝑠
α
ˉ
t
	​

=∏
s=0
t
	​

α
s
	​

 where 
𝜖
0
,
.
.
.
,
𝜖
𝑡
−
2
,
𝜖
𝑡
−
1
∼
𝑁
(
0
,
𝐼
)
ϵ
0
	​

,...,ϵ
t−2
	​

,ϵ
t−1
	​

∼N(0,I), one can use the reparameterization trick in a recursive manner to prove that:

𝑥
𝑡
	
=
1
−
𝛽
𝑡
𝑥
𝑡
−
1
+
𝛽
𝑡
𝜖
𝑡
−
1


	
=
𝛼
𝑡
𝑥
𝑡
−
2
+
1
−
𝛼
𝑡
𝜖
𝑡
−
2


	
=
…


	
=
𝛼
ˉ
𝑡
𝑥
0
+
1
−
𝛼
ˉ
𝑡
𝜖0
x
t
	​

	​

=
1−β
t
	​

	​

x
t−1
	​

+
β
t
	​

	​

ϵ
t−1
	​

=
α
t
	​

	​

x
t−2
	​

+
1−α
t
	​

	​

ϵ
t−2
	​

=…
=
α
ˉ
t
	​

	​

x
0
	​

+
1−
α
ˉ
t
	​

	​

ϵ
0
	​

	​


Note: Since all timestep have the same Gaussian noise we will only use the symbol 
𝜖
ϵ from now on.

Thus to produce a sample 
𝑥
𝑡
x
t
	​

 we can use the following distribution:

𝑥
𝑡
∼
𝑞
(
𝑥
𝑡
∣
𝑥
0
)
=
𝑁
(
𝑥
𝑡
;
𝛼
ˉ
𝑡
𝑥
0
,
(
1
−
𝛼
ˉ
𝑡
)
𝐼
)
x
t
	​

∼q(x
t
	​

∣x
0
	​

)=N(x
t
	​

;
α
ˉ
t
	​

	​

x
0
	​

,(1−
α
ˉ
t
	​

)I)

Since 
𝛽
𝑡
β
t
	​

 is a hyperparameter, we can precompute 
𝛼
𝑡
α
t
	​

 and 
𝛼
ˉ
𝑡
α
ˉ
t
	​

 for all timesteps. This means that we sample noise at any timestep 
𝑡
t and get 
𝑥
𝑡
x
t
	​

 in one go. Hence, we can sample our latent variable 
𝑥
𝑡
x
t
	​

 at any arbitrary timestep. This will be our target later on to calculate our tractable objective loss 
𝐿
𝑡
L
t
	​

.

Variance schedule

The variance parameter 
𝛽
𝑡
β
t
	​

 can be fixed to a constant or chosen as a schedule over the 
𝑇
T timesteps. In fact, one can define a variance schedule, which can be linear, quadratic, cosine etc. The original DDPM authors utilized a linear schedule increasing from 
𝛽
1
=
1
0
−
4
β
1
	​

=10
−4
 to 
𝛽
𝑇
=
0.02
β
T
	​

=0.02. Nichol et al. 2021 showed that employing a cosine schedule works even better.

Latent samples from linear (top) and cosine (bottom) schedules respectively. Source: Nichol & Dhariwal 2021

Reverse diffusion

As 
𝑇
→
∞
T→∞, the latent 
𝑥
𝑇
x
T
	​

 is nearly an isotropic Gaussian distribution. Therefore if we manage to learn the reverse distribution 
𝑞
(
𝑥
𝑡
−
1
∣
𝑥
𝑡
)
q(x
t−1
	​

∣x
t
	​

) , we can sample 
𝑥
𝑇
x
T
	​

 from 
𝑁
(
0
,
𝐼
)
N(0,I), run the reverse process and acquire a sample from 
𝑞
(
𝑥
0
)
q(x
0
	​

), generating a novel data point from the original data distribution.

The question is how we can model the reverse diffusion process.

Approximating the reverse process with a neural network

In practical terms, we don't know 
𝑞
(
𝑥
𝑡
−
1
∣
𝑥
𝑡
)
q(x
t−1
	​

∣x
t
	​

). It's intractable since statistical estimates of 
𝑞
(
𝑥
𝑡
−
1
∣
𝑥
𝑡
)
q(x
t−1
	​

∣x
t
	​

) require computations involving the data distribution.

Instead, we approximate 
𝑞
(
𝑥
𝑡
−
1
∣
𝑥
𝑡
)
q(x
t−1
	​

∣x
t
	​

) with a parameterized model 
𝑝
𝜃
p
θ
	​

 (e.g. a neural network). Since 
𝑞
(
𝑥
𝑡
−
1
∣
𝑥
𝑡
)
q(x
t−1
	​

∣x
t
	​

) will also be Gaussian, for small enough 
𝛽
𝑡
β
t
	​

, we can choose 
𝑝
𝜃
p
θ
	​

 to be Gaussian and just parameterize the mean and variance:

𝑝
𝜃
(
𝑥
𝑡
−
1
∣
𝑥
𝑡
)
=
𝑁
(
𝑥
𝑡
−
1
;
𝜇
𝜃
(
𝑥
𝑡
,
𝑡
)
,
𝛴
𝜃
(
𝑥
𝑡
,
𝑡
)
)
p
θ
	​

(x
t−1
	​

∣x
t
	​

)=N(x
t−1
	​

;μ
θ
	​

(x
t
	​

,t),Σ
θ
	​

(x
t
	​

,t))

Reverse diffusion process. Image modified by Ho et al. 2020

If we apply the reverse formula for all timesteps (
𝑝
𝜃
(
𝑥
0
:
𝑇
)
p
θ
	​

(x
0:T
	​

), also called trajectory), we can go from 
𝑥
𝑇
x
T
	​

 to the data distribution:

𝑝
𝜃
(
𝑥
0
:
𝑇
)
=
𝑝
𝜃
(
𝑥
𝑇
)
∏
𝑡
=
1
𝑇
𝑝
𝜃
(
𝑥
𝑡
−
1
∣
𝑥
𝑡
)
p
θ
	​

(x
0:T
	​

)=p
θ
	​

(x
T
	​

)
t=1
∏
T
	​

p
θ
	​

(x
t−1
	​

∣x
t
	​

)

By additionally conditioning the model on timestep 
𝑡
t, it will learn to predict the Gaussian parameters (meaning the mean 
𝜇
𝜃
(
𝑥
𝑡
,
𝑡
)
μ
θ
	​

(x
t
	​

,t) and the covariance matrix 
𝛴
𝜃
(
𝑥
𝑡
,
𝑡
)
Σ
θ
	​

(x
t
	​

,t) ) for each timestep.

But how do we train such a model?

Training a diffusion model

If we take a step back, we can notice that the combination of 
𝑞
q and 
𝑝
p is very similar to a variational autoencoder (VAE). Thus, we can train it by optimizing the negative log-likelihood of the training data. After a series of calculations, which we won't analyze here, we can write the evidence lower bound (ELBO) as follows:

𝑙
𝑜
𝑔
𝑝
(
𝑥
)
≥
	
𝐸
𝑞
(
𝑥
1
∣
𝑥
0
)
[
𝑙
𝑜
𝑔
𝑝
𝜃
(
𝑥
0
∣
𝑥
1
)
]
−


	
𝐷
𝐾
𝐿
(
𝑞
(
𝑥
𝑇
∣
𝑥
0
)
∣
∣
𝑝
(
𝑥
𝑇
)
)
−


	
∑
𝑡
=
2
𝑇
𝐸
𝑞
(
𝑥
𝑡
∣
𝑥
0
)
[
𝐷
𝐾
𝐿
(
𝑞
(
𝑥
𝑡
−
1
∣
𝑥
𝑡
,
𝑥
0
)
∣
∣
𝑝
𝜃
(
𝑥
𝑡
−
1
∣
𝑥
𝑡
)
)
]


	
=
𝐿
0
−
𝐿
𝑇
−
∑
𝑡
=
2
𝑇
𝐿
𝑡
−
1
logp(x)≥
	​

E
q(x
1
	​

∣x
0
	​

)
	​

[logp
θ
	​

(x
0
	​

∣x
1
	​

)]−
D
KL
	​

(q(x
T
	​

∣x
0
	​

)∣∣p(x
T
	​

))−
t=2
∑
T
	​

E
q(x
t
	​

∣x
0
	​

)
	​

[D
KL
	​

(q(x
t−1
	​

∣x
t
	​

,x
0
	​

)∣∣p
θ
	​

(x
t−1
	​

∣x
t
	​

))]
=L
0
	​

−L
T
	​

−
t=2
∑
T
	​

L
t−1
	​

	​


Let's analyze these terms:

The 
𝐸
𝑞
(
𝑥
1
∣
𝑥
0
)
[
𝑙
𝑜
𝑔
𝑝
𝜃
(
𝑥
0
∣
𝑥
1
)
]
E
q(x
1
	​

∣x
0
	​

)
	​

[logp
θ
	​

(x
0
	​

∣x
1
	​

)] term can been as a reconstruction term, similar to the one in the ELBO of a variational autoencoder. In Ho et al 2020 , this term is learned using a separate decoder.

𝐷
𝐾
𝐿
(
𝑞
(
𝑥
𝑇
∣
𝑥
0
)
∣
∣
𝑝
(
𝑥
𝑇
)
)
D
KL
	​

(q(x
T
	​

∣x
0
	​

)∣∣p(x
T
	​

)) shows how close 
𝑥
𝑇
x
T
	​

 is to the standard Gaussian. Note that the entire term has no trainable parameters so it's ignored during training.

The third term 
∑
𝑡
=
2
𝑇
𝐿
𝑡
−
1
∑
t=2
T
	​

L
t−1
	​

, also referred as 
𝐿
𝑡
L
t
	​

, formulate the difference between the desired denoising steps 
𝑝
𝜃
(
𝑥
𝑡
−
1
∣
𝑥
𝑡
)
)
p
θ
	​

(x
t−1
	​

∣x
t
	​

)) and the approximated ones 
𝑞
(
𝑥
𝑡
−
1
∣
𝑥
𝑡
,
𝑥
0
)
q(x
t−1
	​

∣x
t
	​

,x
0
	​

).

It is evident that through the ELBO, maximizing the likelihood boils down to learning the denoising steps 
𝐿
𝑡
L
t
	​

.

Important note: Even though 
𝑞
(
𝑥
𝑡
−
1
∣
𝑥
𝑡
)
q(x
t−1
	​

∣x
t
	​

) is intractable Sohl-Dickstein et al illustrated that by additionally conditioning on 
x
0
x
0
	​

 makes it tractable.

Intuitively, a painter (our generative model) needs a reference image (
x
0
x
0
	​

) to slowly draw (reverse diffusion step 
𝑞
(
𝑥
𝑡
−
1
∣
𝑥
𝑡
,
𝑥
0
)
q(x
t−1
	​

∣x
t
	​

,x
0
	​

)) an image. Thus, we can take a small step backwards, meaning from noise to generate an image, if and only if we have 
x
0
x
0
	​

 as a reference.

In other words, we can sample 
x
𝑡
x
t
	​

 at noise level 
𝑡
t conditioned on 
x
0
x
0
	​

. Since 
𝛼
𝑡
=
1
−
𝛽
𝑡
α
t
	​

=1−β
t
	​

 and 
𝛼
ˉ
𝑡
=
∏
𝑠
=
0
𝑡
𝛼
𝑠
α
ˉ
t
	​

=∏
s=0
t
	​

α
s
	​

, we can prove that:

𝑞
(
𝑥
𝑡
−
1
∣
𝑥
𝑡
,
𝑥
0
)
	
=
𝑁
(
𝑥
𝑡
−
1
;
𝜇
~
(
𝑥
𝑡
,
𝑥
0
)
,
𝛽
~
𝑡
𝐼
)


𝛽
~
𝑡
	
=
1
−
𝛼
ˉ
𝑡
−
1
1
−
𝛼
ˉ
𝑡
⋅
𝛽
𝑡


𝜇
~
𝑡
(
𝑥
𝑡
,
𝑥
0
)
	
=
𝛼
ˉ
𝑡
−
1
𝛽
𝑡
1
−
𝛼
ˉ
𝑡
𝑥
0
+
𝛼
𝑡
(
1
−
𝛼
ˉ
𝑡
−
1
)
1
−
𝛼
ˉ
𝑡
𝑥
𝑡
q(x
t−1
	​

∣x
t
	​

,x
0
	​

)
β
~
	​

t
	​

μ
~
	​

t
	​

(x
t
	​

,x
0
	​

)
	​

=N(x
t−1
	​

;
μ
~
	​

(x
t
	​

,x
0
	​

),
β
~
	​

t
	​

I)
=
1−
α
ˉ
t
	​

1−
α
ˉ
t−1
	​

	​

⋅β
t
	​

=
1−
α
ˉ
t
	​

α
ˉ
t−1
	​

	​

β
t
	​

	​

x
0
	​

+
1−
α
ˉ
t
	​

α
t
	​

	​

(1−
α
ˉ
t−1
	​

)
	​

x
t
	​

	​


Note that 
𝛼
𝑡
α
t
	​

 and 
𝛼
ˉ
𝑡
α
ˉ
t
	​

 depend only on 
𝛽
𝑡
β
t
	​

, so they can be precomputed.

This little trick provides us with a fully tractable ELBO. The above property has one more important side effect, as we already saw in the reparameterization trick, we can represent 
𝑥
0
x
0
	​

 as

𝑥
0
=
1
𝛼
ˉ
𝑡
(
𝑥
𝑡
−
1
−
𝛼
ˉ
𝑡
𝜖
)
)
,
x
0
	​

=
α
ˉ
t
	​

	​

1
	​

(x
t
	​

−
1−
α
ˉ
t
	​

	​

ϵ)),

where 
𝜖
∼
𝑁
(
0
,
𝐼
)
ϵ∼N(0,I).

By combining the last two equations, each timestep will now have a mean 
𝜇
~
𝑡
μ
~
	​

t
	​

 (our target) that only depends on 
𝑥
𝑡
x
t
	​

:

𝜇
~
𝑡
(
𝑥
𝑡
)
=
1
𝛼
𝑡
(
𝑥
𝑡
−
𝛽
𝑡
1
−
𝛼
ˉ
𝑡
𝜖
)
)
μ
~
	​

t
	​

(x
t
	​

)=
α
t
	​

	​

1
	​

(x
t
	​

−
1−
α
ˉ
t
	​

	​

β
t
	​

	​

ϵ))

Therefore we can use a neural network 
𝜖
𝜃
(
𝑥
𝑡
,
𝑡
)
ϵ
θ
	​

(x
t
	​

,t) to approximate 
𝜖
ϵ and consequently the mean:

𝜇
𝜃
~
(
𝑥
𝑡
,
𝑡
)
=
1
𝛼
𝑡
(
𝑥
𝑡
−
𝛽
𝑡
1
−
𝛼
ˉ
𝑡
𝜖
𝜃
(
𝑥
𝑡
,
𝑡
)
)
μ
θ
	​

~
	​

(x
t
	​

,t)=
α
t
	​

	​

1
	​

(x
t
	​

−
1−
α
ˉ
t
	​

	​

β
t
	​

	​

ϵ
θ
	​

(x
t
	​

,t))

Thus, the loss function (the denoising term in the ELBO) can be expressed as:

𝐿
𝑡
	
=
𝐸
𝑥
0
,
𝑡
,
𝜖
[
1
2
∣
∣
𝛴
𝜃
(
𝑥
𝑡
,
𝑡
)
∣
∣
2
2
∣
∣
𝜇
~
𝑡
−
𝜇
𝜃
(
𝑥
𝑡
,
𝑡
)
∣
∣
2
2
]


	
=
𝐸
𝑥
0
,
𝑡
,
𝜖
[
𝛽
𝑡
2
2
𝛼
𝑡
(
1
−
𝛼
ˉ
𝑡
)
∣
∣
𝛴
𝜃
∣
∣
2
2
∥
𝜖
𝑡
−
𝜖
𝜃
(
𝑎
ˉ
𝑡
𝑥
0
+
1
−
𝑎
ˉ
𝑡
𝜖
,
𝑡
)
∣
∣
2
]
L
t
	​

	​

=E
x
0
	​

,t,ϵ
	​

[
2∣∣Σ
θ
	​

(x
t
	​

,t)∣∣
2
2
	​

1
	​

∣∣
μ
~
	​

t
	​

−μ
θ
	​

(x
t
	​

,t)∣∣
2
2
	​

]
=E
x
0
	​

,t,ϵ
	​

[
2α
t
	​

(1−
α
ˉ
t
	​

)∣∣Σ
θ
	​

∣∣
2
2
	​

β
t
2
	​

	​

∥ϵ
t
	​

−ϵ
θ
	​

(
a
ˉ
t
	​

	​

x
0
	​

+
1−
a
ˉ
t
	​

	​

ϵ,t)∣∣
2
]
	​


This effectively shows us that instead of predicting the mean of the distribution, the model will predict the noise 
𝜖
ϵ at each timestep 
𝑡
t.

Ho et.al 2020 made a few simplifications to the actual loss term as they ignore a weighting term. The simplified version outperforms the full objective:

𝐿
𝑡
simple
=
𝐸
𝑥
0
,
𝑡
,
𝜖
[
∥
𝜖
−
𝜖
𝜃
(
𝑎
ˉ
𝑡
𝑥
0
+
1
−
𝑎
ˉ
𝑡
𝜖
,
𝑡
)
∣
∣
2
]
L
t
simple
	​

=E
x
0
	​

,t,ϵ
	​

[∥ϵ−ϵ
θ
	​

(
a
ˉ
t
	​

	​

x
0
	​

+
1−
a
ˉ
t
	​

	​

ϵ,t)∣∣
2
]

The authors found that optimizing the above objective works better than optimizing the original ELBO. The proof for both equations can be found in this excellent post by Lillian Weng or in Luo et al. 2022.

Additionally, Ho et. al 2020 decide to keep the variance fixed and have the network learn only the mean. This was later improved by Nichol et al. 2021, who decide to let the network learn the covariance matrix 
(
𝛴
)
(Σ) as well (by modifying 
𝐿
𝑡
simple
L
t
simple
	​

 ), achieving better results.

Training and sampling algorithms of DDPMs. Source: Ho et al. 2020

Architecture

One thing that we haven't mentioned so far is what the model's architecture looks like. Notice that the model's input and output should be of the same size.

To this end, Ho et al. employed a U-Net. If you are unfamiliar with U-Nets, feel free to check out our past article on the major U-Net architectures. In a few words, a U-Net is a symmetric architecture with input and output of the same spatial size that uses skip connections between encoder and decoder blocks of corresponding feature dimension. Usually, the input image is first downsampled and then upsampled until reaching its initial size.

In the original implementation of DDPMs, the U-Net consists of Wide ResNet blocks, group normalization as well as self-attention blocks.

The diffusion timestep 
𝑡
t is specified by adding a sinusoidal position embedding into each residual block. For more details, feel free to visit the official GitHub repository. For a detailed implementation of the diffusion model, check out this awesome post by Hugging Face.

The U-Net architecture. Source: Ronneberger et al.

Conditional Image Generation: Guided Diffusion

A crucial aspect of image generation is conditioning the sampling process to manipulate the generated samples. Here, this is also referred to as guided diffusion.

There have even been methods that incorporate image embeddings into the diffusion in order to "guide" the generation. Mathematically, guidance refers to conditioning a prior data distribution 
𝑝
(
x
)
p(x) with a condition 
𝑦
y, i.e. the class label or an image/text embedding, resulting in 
𝑝
(
x
∣
𝑦
)
p(x∣y).

To turn a diffusion model 
𝑝
𝜃
p
θ
	​

 into a conditional diffusion model, we can add conditioning information 
𝑦
y at each diffusion step.

𝑝
𝜃
(
𝑥
0
:
𝑇
∣
𝑦
)
=
𝑝
𝜃
(
𝑥
𝑇
)
∏
𝑡
=
1
𝑇
𝑝
𝜃
(
𝑥
𝑡
−
1
∣
𝑥
𝑡
,
𝑦
)
p
θ
	​

(x
0:T
	​

∣y)=p
θ
	​

(x
T
	​

)
t=1
∏
T
	​

p
θ
	​

(x
t−1
	​

∣x
t
	​

,y)

The fact that the conditioning is being seen at each timestep may be a good justification for the excellent samples from a text prompt.

In general, guided diffusion models aim to learn 
∇
log
⁡
𝑝
𝜃
(
𝑥
𝑡
∣
𝑦
)
∇logp
θ
	​

(x
t
	​

∣y). So using the Bayes rule, we can write:

∇
x
𝑡
log
⁡
𝑝
𝜃
(
𝑥
𝑡
∣
𝑦
)
	
=
∇
x
𝑡
log
⁡
(
𝑝
𝜃
(
𝑦
∣
𝑥
𝑡
)
𝑝
𝜃
(
𝑥
𝑡
)
𝑝
𝜃
(
𝑦
)
)


	
=
∇
x
𝑡
𝑙
𝑜
𝑔
𝑝
𝜃
(
𝑥
𝑡
)
+
∇
x
𝑡
𝑙
𝑜
𝑔
(
𝑝
𝜃
(
𝑦
∣
𝑥
𝑡
)
)
∇
x
t
	​

	​

logp
θ
	​

(x
t
	​

∣y)
	​

=∇
x
t
	​

	​

log(
p
θ
	​

(y)
p
θ
	​

(y∣x
t
	​

)p
θ
	​

(x
t
	​

)
	​

)
=∇
x
t
	​

	​

logp
θ
	​

(x
t
	​

)+∇
x
t
	​

	​

log(p
θ
	​

(y∣x
t
	​

))
	​


𝑝
𝜃
(
𝑦
)
p
θ
	​

(y) is removed since the gradient operator 
∇
x
𝑡
∇
x
t
	​

	​

 refers only to 
x
𝑡
x
t
	​

, so no gradient for 
𝑦
y. Moreover remember that 
log
⁡
(
𝑎
𝑏
)
=
log
⁡
(
𝑎
)
+
log
⁡
(
𝑏
)
log(ab)=log(a)+log(b).

And by adding a guidance scalar term 
𝑠
s, we have:

∇
log
⁡
𝑝
𝜃
(
𝑥
𝑡
∣
𝑦
)
=
∇
log
⁡
𝑝
𝜃
(
𝑥
𝑡
)
+
𝑠
⋅
∇
log
⁡
(
𝑝
𝜃
(
𝑦
∣
𝑥
𝑡
)
)
∇logp
θ
	​

(x
t
	​

∣y)=∇logp
θ
	​

(x
t
	​

)+s⋅∇log(p
θ
	​

(y∣x
t
	​

))

Using this formulation, let's make a distinction between classifier and classifier-free guidance. Next, we will present two family of methods aiming at injecting label information.

Classifier guidance

Sohl-Dickstein et al. and later Dhariwal and Nichol showed that we can use a second model, a classifier 
𝑓
𝜙
(
𝑦
∣
𝑥
𝑡
,
𝑡
)
f
ϕ
	​

(y∣x
t
	​

,t), to guide the diffusion toward the target class 
𝑦
y during training. To achieve that, we can train a classifier 
𝑓
𝜙
(
𝑦
∣
𝑥
𝑡
,
𝑡
)
f
ϕ
	​

(y∣x
t
	​

,t) on the noisy image 
𝑥
𝑡
x
t
	​

 to predict its class 
𝑦
y. Then we can use the gradients 
∇
log
⁡
(
𝑓
𝜙
(
𝑦
∣
𝑥
𝑡
)
)
∇log(f
ϕ
	​

(y∣x
t
	​

)) to guide the diffusion. How?

We can build a class-conditional diffusion model with mean 
𝜇
𝜃
(
𝑥
𝑡
∣
𝑦
)
μ
θ
	​

(x
t
	​

∣y) and variance 
𝛴
𝜃
(
𝑥
𝑡
∣
𝑦
)
Σ
θ
	​

(x
t
	​

∣y).

Since 
𝑝
𝜃
∼
𝑁
(
𝜇
𝜃
,
Σ
𝜃
)
p
θ
	​

∼N(μ
θ
	​

,Σ
θ
	​

), we can show using the guidance formulation from the previous section that the mean is perturbed by the gradients of 
log
⁡
𝑓
𝜙
(
𝑦
∣
𝑥
𝑡
)
logf
ϕ
	​

(y∣x
t
	​

) of class 
𝑦
y, resulting in:

𝜇
^
(
𝑥
𝑡
∣
𝑦
)
=
𝜇
𝜃
(
𝑥
𝑡
∣
𝑦
)
+
𝑠
⋅
𝛴
𝜃
(
𝑥
𝑡
∣
𝑦
)
∇
𝑥
𝑡
𝑙
𝑜
𝑔
𝑓
𝜙
(
𝑦
∣
𝑥
𝑡
,
𝑡
)
μ
^
	​

(x
t
	​

∣y)=μ
θ
	​

(x
t
	​

∣y)+s⋅Σ
θ
	​

(x
t
	​

∣y)∇
x
t
	​

	​

logf
ϕ
	​

(y∣x
t
	​

,t)

In the famous GLIDE paper by Nichol et al, the authors expanded on this idea and use CLIP embeddings to guide the diffusion. CLIP as proposed by Saharia et al., consists of an image encoder 
𝑔
g and a text encoder 
ℎ
h. It produces an image and text embeddings 
𝑔
(
𝑥
𝑡
)
g(x
t
	​

) and 
ℎ
(
𝑐
)
h(c), respectively, wherein 
𝑐
c is the text caption.

Therefore, we can perturb the gradients with their dot product:

𝜇
^
(
𝑥
𝑡
∣
𝑐
)
=
𝜇
(
𝑥
𝑡
∣
𝑐
)
+
𝑠
⋅
𝛴
𝜃
(
𝑥
𝑡
∣
𝑐
)
∇
𝑥
𝑡
𝑔
(
𝑥
𝑡
)
⋅
ℎ
(
𝑐
)
μ
^
	​

(x
t
	​

∣c)=μ(x
t
	​

∣c)+s⋅Σ
θ
	​

(x
t
	​

∣c)∇
x
t
	​

	​

g(x
t
	​

)⋅h(c)

As a result, they manage to "steer" the generation process toward a user-defined text caption.

Algorithm of classifier guided diffusion sampling. Source: Dhariwal & Nichol 2021

Classifier-free guidance

Using the same formulation as before we can define a classifier-free guided diffusion model as:

∇
log
⁡
𝑝
(
𝑥
𝑡
∣
𝑦
)
=
𝑠
⋅
∇
𝑙
𝑜
𝑔
(
𝑝
(
𝑥
𝑡
∣
𝑦
)
)
+
(
1
−
𝑠
)
⋅
∇
𝑙
𝑜
𝑔
𝑝
(
𝑥
𝑡
)
∇logp(x
t
	​

∣y)=s⋅∇log(p(x
t
	​

∣y))+(1−s)⋅∇logp(x
t
	​

)

Guidance can be achieved without a second classifier model as proposed by Ho & Salimans. Instead of training a separate classifier, the authors trained a conditional diffusion model 
𝜖
𝜃
(
𝑥
𝑡
∣
𝑦
)
ϵ
θ
	​

(x
t
	​

∣y) together with an unconditional model 
𝜖
𝜃
(
𝑥
𝑡
∣
0
)
ϵ
θ
	​

(x
t
	​

∣0). In fact, they use the exact same neural network. During training, they randomly set the class 
𝑦
y to 
0
0, so that the model is exposed to both the conditional and unconditional setup:

𝜖
^
𝜃
(
𝑥
𝑡
∣
𝑦
)
	
=
𝑠
⋅
𝜖
𝜃
(
𝑥
𝑡
∣
𝑦
)
+
(
1
−
𝑠
)
⋅
𝜖
𝜃
(
𝑥
𝑡
∣
0
)


	
=
𝜖
𝜃
(
𝑥
𝑡
∣
0
)
+
𝑠
⋅
(
𝜖
𝜃
(
𝑥
𝑡
∣
𝑦
)
−
𝜖
𝜃
(
𝑥
𝑡
∣
0
)
)
ϵ
^
θ
	​

(x
t
	​

∣y)
	​

=s⋅ϵ
θ
	​

(x
t
	​

∣y)+(1−s)⋅ϵ
θ
	​

(x
t
	​

∣0)
=ϵ
θ
	​

(x
t
	​

∣0)+s⋅(ϵ
θ
	​

(x
t
	​

∣y)−ϵ
θ
	​

(x
t
	​

∣0))
	​


Note that this can also be used to "inject" text embeddings as we showed in classifier guidance.

This admittedly "weird" process has two major advantages:

It uses only a single model to guide the diffusion.

It simplifies guidance when conditioning on information that is difficult to predict with a classifier (such as text embeddings).

Imagen as proposed by Saharia et al. relies heavily on classifier-free guidance, as they find that it is a key contributor to generating samples with strong image-text alignment. For more info on the approach of Imagen check out this video from AI Coffee Break with Letitia:

Scaling up diffusion models

You might be asking what is the problem with these models. Well, it's computationally very expensive to scale these U-nets into high-resolution images. This brings us to two methods for scaling up diffusion models to higher resolutions: cascade diffusion models and latent diffusion models.

Cascade diffusion models

Ho et al. 2021 introduced cascade diffusion models in an effort to produce high-fidelity images. A cascade diffusion model consists of a pipeline of many sequential diffusion models that generate images of increasing resolution. Each model generates a sample with superior quality than the previous one by successively upsampling the image and adding higher resolution details. To generate an image, we sample sequentially from each diffusion model.

Cascade diffusion model pipeline. Source: Ho & Saharia et al.

To acquire good results with cascaded architectures, strong data augmentations on the input of each super-resolution model are crucial. Why? Because it alleviates compounding error from the previous cascaded models, as well as due to a train-test mismatch.

It was found that gaussian blurring is a critical transformation toward achieving high fidelity. They refer to this technique as conditioning augmentation.

Stable diffusion: Latent diffusion models

Latent diffusion models are based on a rather simple idea: instead of applying the diffusion process directly on a high-dimensional input, we project the input into a smaller latent space and apply the diffusion there.

In more detail, Rombach et al. proposed to use an encoder network to encode the input into a latent representation i.e. 
𝑧
𝑡
=
𝑔
(
𝑥
𝑡
)
z
t
	​

=g(x
t
	​

). The intuition behind this decision is to lower the computational demands of training diffusion models by processing the input in a lower dimensional space. Afterward, a standard diffusion model (U-Net) is applied to generate new data, which are upsampled by a decoder network.

If the loss for a typical diffusion model (DM) is formulated as:

𝐿
𝐷
𝑀
=
𝐸
𝑥
,
𝑡
,
𝜖
[
∥
𝜖
−
𝜖
𝜃
(
𝑥
𝑡
,
𝑡
)
∣
∣
2
]
L
DM
	​

=E
x,t,ϵ
	​

[∥ϵ−ϵ
θ
	​

(x
t
	​

,t)∣∣
2
]

then given an encoder 
𝐸
E and a latent representation 
𝑧
z, the loss for a latent diffusion model (LDM) is:

𝐿
𝐿
𝐷
𝑀
=
𝐸
𝐸
(
𝑥
)
,
𝑡
,
𝜖
[
∥
𝜖
−
𝜖
𝜃
(
𝑧
𝑡
,
𝑡
)
∣
∣
2
]
L
LDM
	​

=E
E(x),t,ϵ
	​

[∥ϵ−ϵ
θ
	​

(z
t
	​

,t)∣∣
2
]

Latent diffusion models. Source: Rombach et al

For more information check out this video:

Score-based generative models

Around the same time as the DDPM paper, Song and Ermon proposed a different type of generative model that appears to have many similarities with diffusion models. Score-based models tackle generative learning using score matching and Langevin dynamics.

Score-matching refers to the process of modeling the gradient of the log probability density function, also known as the score function. Langevin dynamics is an iterative process that can draw samples from a distribution using only its score function.

𝑥
𝑡
=
𝑥
𝑡
−
1
+
𝛿
2
∇
𝑥
log
⁡
𝑝
(
𝑥
𝑡
−
1
)
+
𝛿
𝜖
,
 where 
𝜖
∼
𝑁
(
0
,
𝐼
)
x
t
	​

=x
t−1
	​

+
2
δ
	​

∇
x
	​

logp(x
t−1
	​

)+
δ
	​

ϵ, where ϵ∼N(0,I)

where 
𝛿
δ is the step size.

Suppose that we have a probability density 
𝑝
(
𝑥
)
p(x) and that we define the score function to be 
∇
𝑥
log
⁡
𝑝
(
𝑥
)
∇
x
	​

logp(x). We can then train a neural network 
𝑠
𝜃
s
θ
	​

 to estimate 
∇
𝑥
log
⁡
𝑝
(
𝑥
)
∇
x
	​

logp(x) without estimating 
𝑝
(
𝑥
)
p(x) first. The training objective can be formulated as follows:

𝐸
𝑝
(
𝑥
)
[
∥
∇
𝑥
log
⁡
𝑝
(
𝑥
)
−
𝑠
𝜃
(
𝑥
)
∥
2
2
]
=
∫
𝑝
(
𝑥
)
∥
∇
𝑥
log
⁡
𝑝
(
𝑥
)
−
𝑠
𝜃
(
𝑥
)
∥
2
2
d
𝑥
E
p(x)
	​

[∥∇
x
	​

logp(x)−s
θ
	​

(x)∥
2
2
	​

]=∫p(x)∥∇
x
	​

logp(x)−s
θ
	​

(x)∥
2
2
	​

dx

Then by using Langevin dynamics, we can directly sample from 
𝑝
(
𝑥
)
p(x) using the approximated score function.

In case you missed it, guided diffusion models use this formulation of score-based models as they learn directly 
∇
𝑥
log
⁡
𝑝
(
𝑥
)
∇
x
	​

logp(x). Of course, they don’t rely on Langevin dynamics.

Adding noise to score-based models: Noise Conditional Score Networks (NCSN)

The problem so far: the estimated score functions are usually inaccurate in low-density regions, where few data points are available. As a result, the quality of data sampled using Langevin dynamics is not good.

Their solution was to perturb the data points with noise and train score-based models on the noisy data points instead. As a matter of fact, they used multiple scales of Gaussian noise perturbations.

Thus, adding noise is the key to make both DDPM and score based models work.

Score-based generative modeling with score matching + Langevin dynamics. Source: Generative Modeling by Estimating Gradients of the Data Distribution

Mathematically, given the data distribution 
𝑝
(
𝑥
)
p(x), we perturb with Gaussian noise 
𝑁
(
0
,
𝜎
𝑖
2
𝐼
)
N(0,σ
i
2
	​

I) where 
𝑖
=
1
,
2
,
⋯
 
,
𝐿
i=1,2,⋯,L to obtain a noise-perturbed distribution:

𝑝
𝜎
𝑖
(
𝑥
)
=
∫
𝑝
(
𝑦
)
𝑁
(
𝑥
;
𝑦
,
𝜎
𝑖
2
𝐼
)
d
𝑦
p
σ
i
	​

	​

(x)=∫p(y)N(x;y,σ
i
2
	​

I)dy

Then we train a network 
𝑠
𝜃
(
𝑥
,
𝑖
)
s
θ
	​

(x,i), known as Noise Conditional Score-Based Network (NCSN) to estimate the score function 
∇
𝑥
log
⁡
𝑑
𝜎
𝑖
(
𝑥
)
∇
x
	​

logd
σ
i
	​

	​

(x). The training objective is a weighted sum of Fisher divergences for all noise scales.

∑
𝑖
=
1
𝐿
𝜆
(
𝑖
)
𝐸
𝑝
𝜎
𝑖
(
𝑥
)
[
∥
∇
𝑥
log
⁡
𝑝
𝜎
𝑖
(
𝑥
)
−
𝑠
𝜃
(
𝑥
,
𝑖
)
∥
2
2
]
i=1
∑
L
	​

λ(i)E
p
σ
i
	​

	​

(x)
	​

[∥∇
x
	​

logp
σ
i
	​

	​

(x)−s
θ
	​

(x,i)∥
2
2
	​

]
Score-based generative modeling through stochastic differential equations (SDE)

Song et al. 2021 explored the connection of score-based models with diffusion models. In an effort to encapsulate both NSCNs and DDPMs under the same umbrella, they proposed the following:

Instead of perturbing data with a finite number of noise distributions, we use a continuum of distributions that evolve over time according to a diffusion process. This process is modeled by a prescribed stochastic differential equation (SDE) that does not depend on the data and has no trainable parameters. By reversing the process, we can generate new samples.

Score-based generative modeling through stochastic differential equations (SDE). Source: Song et al. 2021

We can define the diffusion process 
{
𝑥
(
𝑡
)
}
𝑡
∈
[
0
,
𝑇
]
{x(t)}
t∈[0,T]
	​

 as an SDE in the following form:

d
𝑥
=
𝑓
(
𝑥
,
𝑡
)
d
𝑡
+
𝑔
(
𝑡
)
d
𝑤
dx=f(x,t)dt+g(t)dw

where 
𝑤
w is the Wiener process (a.k.a., Brownian motion), 
𝑓
(
⋅
,
𝑡
)
f(⋅,t) is a vector-valued function called the drift coefficient of 
𝑥
(
𝑡
)
x(t), and 
𝑔
(
⋅
)
g(⋅) is a scalar function known as the diffusion coefficient of 
𝑥
(
𝑡
)
x(t). Note that the SDE typically has a unique strong solution.

To make sense of why we use an SDE, here is a tip: the SDE is inspired by the Brownian motion, in which a number of particles move randomly inside a medium. This randomness of the particles' motion models the continuous noise perturbations on the data.

After perturbing the original data distribution for a sufficiently long time, the perturbed distribution becomes close to a tractable noise distribution.

To generate new samples, we need to reverse the diffusion process. The SDE was chosen to have a corresponding reverse SDE in closed form:

d
𝑥
=
[
𝑓
(
𝑥
,
𝑡
)
−
𝑔
2
(
𝑡
)
∇
𝑥
log
⁡
𝑝
𝑡
(
𝑥
)
]
d
𝑡
+
𝑔
(
𝑡
)
d
𝑤
dx=[f(x,t)−g
2
(t)∇
x
	​

logp
t
	​

(x)]dt+g(t)dw

To compute the reverse SDE, we need to estimate the score function 
∇
𝑥
log
⁡
𝑝
𝑡
(
𝑥
)
∇
x
	​

logp
t
	​

(x). This is done using a score-based model 
𝑠
𝜃
(
𝑥
,
𝑖
)
s
θ
	​

(x,i) and Langevin dynamics. The training objective is a continuous combination of Fisher divergences:

𝐸
𝑡
∈
𝑈
(
0
,
𝑇
)
𝐸
𝑝
𝑡
(
𝑥
)
[
𝜆
(
𝑡
)
∥
∇
𝑥
log
⁡
𝑝
𝑡
(
𝑥
)
−
𝑠
𝜃
(
𝑥
,
𝑡
)
∥
2
2
]
E
t∈U(0,T)
	​

E
p
t
	​

(x)
	​

[λ(t)∥∇
x
	​

logp
t
	​

(x)−s
θ
	​

(x,t)∥
2
2
	​

]

where 
𝑈
(
0
,
𝑇
)
U(0,T) denotes a uniform distribution over the time interval, and 
𝜆
λ is a positive weighting function. Once we have the score function, we can plug it into the reverse SDE and solve it in order to sample 
𝑥
(
0
)
x(0) from the original data distribution 
𝑝
0
(
𝑥
)
p
0
	​

(x).

There are a number of options to solve the reverse SDE which we won't analyze here. Make sure to check the original paper or this excellent blog post by the author.

Overview of score-based generative modeling through SDEs. Source: Song et al. 2021

Summary

Let’s do a quick sum-up of the main points we learned in this blogpost:

Diffusion models work by gradually adding gaussian noise through a series of 
𝑇
T steps into the original image, a process known as diffusion.

To sample new data, we approximate the reverse diffusion process using a neural network.

The training of the model is based on maximizing the evidence lower bound (ELBO).

We can condition the diffusion models on image labels or text embeddings in order to “guide” the diffusion process.

Cascade and Latent diffusion are two approaches to scale up models to high-resolutions.

Cascade diffusion models are sequential diffusion models that generate images of increasing resolution.

Latent diffusion models (like stable diffusion) apply the diffusion process on a smaller latent space for computational efficiency using a variational autoencoder for the up and downsampling.

Score-based models also apply a sequence of noise perturbations to the original image. But they are trained using score-matching and Langevin dynamics. Nonetheless, they end up in a similar objective.

The diffusion process can be formulated as an SDE. Solving the reverse SDE allows us to generate new samples.

Finally, for more associations between diffusion models and VAE or AE check out these really nice blogs.

Cite as
@article{karagiannakos2022diffusionmodels,
    title   = "Diffusion models: toward state-of-the-art image generation",
    author  = "Karagiannakos, Sergios, Adaloglou, Nikolaos",
    journal = "https://theaisummer.com/",
    year    = "2022",
    howpublished = {https://theaisummer.com/diffusion-models/},
  }
References

[1] Sohl-Dickstein, Jascha, et al. Deep Unsupervised Learning Using Nonequilibrium Thermodynamics. arXiv:1503.03585, arXiv, 18 Nov. 2015

[2] Ho, Jonathan, et al. Denoising Diffusion Probabilistic Models. arXiv:2006.11239, arXiv, 16 Dec. 2020

[3] Nichol, Alex, and Prafulla Dhariwal. Improved Denoising Diffusion Probabilistic Models. arXiv:2102.09672, arXiv, 18 Feb. 2021

[4] Dhariwal, Prafulla, and Alex Nichol. Diffusion Models Beat GANs on Image Synthesis. arXiv:2105.05233, arXiv, 1 June 2021

[5] Nichol, Alex, et al. GLIDE: Towards Photorealistic Image Generation and Editing with Text-Guided Diffusion Models. arXiv:2112.10741, arXiv, 8 Mar. 2022

[6] Ho, Jonathan, and Tim Salimans. Classifier-Free Diffusion Guidance. 2021. openreview.net

[7] Ramesh, Aditya, et al. Hierarchical Text-Conditional Image Generation with CLIP Latents. arXiv:2204.06125, arXiv, 12 Apr. 2022

[8] Saharia, Chitwan, et al. Photorealistic Text-to-Image Diffusion Models with Deep Language Understanding. arXiv:2205.11487, arXiv, 23 May 2022

[9] Rombach, Robin, et al. High-Resolution Image Synthesis with Latent Diffusion Models. arXiv:2112.10752, arXiv, 13 Apr. 2022

[10] Ho, Jonathan, et al. Cascaded Diffusion Models for High Fidelity Image Generation. arXiv:2106.15282, arXiv, 17 Dec. 2021

[11] Weng, Lilian. What Are Diffusion Models? 11 July 2021

[12] O'Connor, Ryan. Introduction to Diffusion Models for Machine Learning AssemblyAI Blog, 12 May 2022

[13] Rogge, Niels and Rasul, Kashif. The Annotated Diffusion Model . Hugging Face Blog, 7 June 2022

[14] Das, Ayan. “An Introduction to Diffusion Probabilistic Models.” Ayan Das, 4 Dec. 2021

[15] Song, Yang, and Stefano Ermon. Generative Modeling by Estimating Gradients of the Data Distribution. arXiv:1907.05600, arXiv, 10 Oct. 2020

[16] Song, Yang, and Stefano Ermon. Improved Techniques for Training Score-Based Generative Models. arXiv:2006.09011, arXiv, 23 Oct. 2020

[17] Song, Yang, et al. Score-Based Generative Modeling through Stochastic Differential Equations. arXiv:2011.13456, arXiv, 10 Feb. 2021

[18] Song, Yang. Generative Modeling by Estimating Gradients of the Data Distribution, 5 May 2021

[19] Luo, Calvin. Understanding Diffusion Models: A Unified Perspective. 25 Aug. 2022

Deep Learning in Production Book 📖
Learn how to build, train, deploy, scale and maintain deep learning models. Understand ML infrastructure and MLOps using hands-on examples.
Learn more

* Disclosure: Please note that some of the links above might be affiliate links, and at no additional cost to you, we will earn a commission if you decide to make a purchase after clicking through.

AI Summer
About
Start Here
Learn AI
Resources
Search
Contact
Privacy Policy
Support us
Books & Courses
Deep Learning in Production
Introduction to Deep Learning & Neural Networks
Representation Learning MSc course 2023
Deep Reinforcement Learning Course
GANs in Computer Vision Free Ebook
Topics
Autoencoders
Attention and Transformers
Convolutional Neural Networks
Computer Vision
Generative Learning
Medical
Natural Language Processing
Reinforcement Learning
Software
Copyright ©2025 All rights reserved