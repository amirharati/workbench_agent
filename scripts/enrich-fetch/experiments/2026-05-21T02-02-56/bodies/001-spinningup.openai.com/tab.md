[Spinning Up](https://spinningup.openai.com/en/latest/index.html)

Table of Contents

*   [Part 1: Key Concepts in RL](#part-1-key-concepts-in-rl)
    *   [What Can RL Do?](#what-can-rl-do)
    *   [Key Concepts and Terminology](#key-concepts-and-terminology)
    *   [(Optional) Formalism](#optional-formalism)

Welcome to our introduction to reinforcement learning! Here, we aim to acquaint you with

*   the language and notation used to discuss the subject,
*   a high-level explanation of what RL algorithms do (although we mostly avoid the question of _how_ they do it),
*   and a little bit of the core math that underlies the algorithms.

In a nutshell, RL is the study of agents and how they learn by trial and error. It formalizes the idea that rewarding or punishing an agent for its behavior makes it more likely to repeat or forego that behavior in the future.

## [What Can RL Do?](#id3)[¶](#what-can-rl-do "Permalink to this headline")

RL methods have recently enjoyed a wide variety of successes. For example, it’s been used to teach computers to control robots in simulation...

...and in the real world...

It’s also famously been used to create breakthrough AIs for sophisticated strategy games, most notably [Go](https://deepmind.com/research/alphago/) and [Dota](https://blog.openai.com/openai-five/), taught computers to [play Atari games](https://deepmind.com/research/dqn/) from raw pixels, and trained simulated robots [to follow human instructions](https://blog.openai.com/deep-reinforcement-learning-from-human-preferences/).

## [Key Concepts and Terminology](#id4)[¶](#key-concepts-and-terminology "Permalink to this headline")

![../\_images/rl\_diagram\_transparent\_bg.png](https://spinningup.openai.com/en/latest/_images/rl_diagram_transparent_bg.png)

Agent-environment interaction loop.

The main characters of RL are the **agent** and the **environment**. The environment is the world that the agent lives in and interacts with. At every step of interaction, the agent sees a (possibly partial) observation of the state of the world, and then decides on an action to take. The environment changes when the agent acts on it, but may also change on its own.

The agent also perceives a **reward** signal from the environment, a number that tells it how good or bad the current world state is. The goal of the agent is to maximize its cumulative reward, called **return**. Reinforcement learning methods are ways that the agent can learn behaviors to achieve its goal.

To talk more specifically what RL does, we need to introduce additional terminology. We need to talk about

*   states and observations,
*   action spaces,
*   policies,
*   trajectories,
*   different formulations of return,
*   the RL optimization problem,
*   and value functions.

### States and Observations[¶](#states-and-observations "Permalink to this headline")

A **state** ![s](https://spinningup.openai.com/en/latest/_images/math/96ac51b9afe79581e48f2f3f0ad3faa0f4402cc7.svg) is a complete description of the state of the world. There is no information about the world which is hidden from the state. An **observation** ![o](https://spinningup.openai.com/en/latest/_images/math/ca2d5053d03bd8fd9f399e5afbb834202e2d2f2d.svg) is a partial description of a state, which may omit information.

In deep RL, we almost always represent states and observations by a [real-valued vector, matrix, or higher-order tensor](https://en.wikipedia.org/wiki/Real_coordinate_space). For instance, a visual observation could be represented by the RGB matrix of its pixel values; the state of a robot might be represented by its joint angles and velocities.

When the agent is able to observe the complete state of the environment, we say that the environment is **fully observed**. When the agent can only see a partial observation, we say that the environment is **partially observed**.

You Should Know

Reinforcement learning notation sometimes puts the symbol for state, ![s](https://spinningup.openai.com/en/latest/_images/math/96ac51b9afe79581e48f2f3f0ad3faa0f4402cc7.svg), in places where it would be technically more appropriate to write the symbol for observation, ![o](https://spinningup.openai.com/en/latest/_images/math/ca2d5053d03bd8fd9f399e5afbb834202e2d2f2d.svg). Specifically, this happens when talking about how the agent decides an action: we often signal in notation that the action is conditioned on the state, when in practice, the action is conditioned on the observation because the agent does not have access to the state.

In our guide, we’ll follow standard conventions for notation, but it should be clear from context which is meant. If something is unclear, though, please raise an issue! Our goal is to teach, not to confuse.

### Action Spaces[¶](#action-spaces "Permalink to this headline")

Different environments allow different kinds of actions. The set of all valid actions in a given environment is often called the **action space**. Some environments, like Atari and Go, have **discrete action spaces**, where only a finite number of moves are available to the agent. Other environments, like where the agent controls a robot in a physical world, have **continuous action spaces**. In continuous spaces, actions are real-valued vectors.

This distinction has some quite-profound consequences for methods in deep RL. Some families of algorithms can only be directly applied in one case, and would have to be substantially reworked for the other.

### Policies[¶](#policies "Permalink to this headline")

A **policy** is a rule used by an agent to decide what actions to take. It can be deterministic, in which case it is usually denoted by ![\\mu](https://spinningup.openai.com/en/latest/_images/math/123eb57279cfbea38a65e8e129bda64972fedc3d.svg):

![a\_t = \\mu(s\_t),](https://spinningup.openai.com/en/latest/_images/math/73fcacd255a221d20d5d9300acf86e4d3bf5ea1b.svg)

or it may be stochastic, in which case it is usually denoted by ![\\pi](https://spinningup.openai.com/en/latest/_images/math/1ae2bd722da01b3a89ffc139af2437c28364a966.svg):

![a\_t \\sim \\pi(\\cdot | s\_t).](https://spinningup.openai.com/en/latest/_images/math/89757355805c4084ac93610e9581c060f2e61610.svg)

Because the policy is essentially the agent’s brain, it’s not uncommon to substitute the word “policy” for “agent”, eg saying “The policy is trying to maximize reward.”

In deep RL, we deal with **parameterized policies**: policies whose outputs are computable functions that depend on a set of parameters (eg the weights and biases of a neural network) which we can adjust to change the behavior via some optimization algorithm.

We often denote the parameters of such a policy by ![\\theta](https://spinningup.openai.com/en/latest/_images/math/ce5edddd490112350f4bd555d9390e0e845f754a.svg) or ![\\phi](https://spinningup.openai.com/en/latest/_images/math/3b22abcadf8773922f8db80011611bad8123a783.svg), and then write this as a subscript on the policy symbol to highlight the connection:

![a\_t &= \\mu\_{\\theta}(s\_t) \\\\
a\_t &\\sim \\pi\_{\\theta}(\\cdot | s\_t).](https://spinningup.openai.com/en/latest/_images/math/831f731859658682b2af7e217a76648697c9de46.svg)

#### Deterministic Policies[¶](#deterministic-policies "Permalink to this headline")

**Example: Deterministic Policies.** Here is a code snippet for building a simple deterministic policy for a continuous action space in PyTorch, using the `torch.nn` package:

pi\_net \= nn.Sequential(
              nn.Linear(obs\_dim, 64),
              nn.Tanh(),
              nn.Linear(64, 64),
              nn.Tanh(),
              nn.Linear(64, act\_dim)
            )

This builds a multi-layer perceptron (MLP) network with two hidden layers of size 64 and ![\\tanh](https://spinningup.openai.com/en/latest/_images/math/c65796f3bb56c457e63ebc770e3d775cace08673.svg) activation functions. If `obs` is a Numpy array containing a batch of observations, `pi_net` can be used to obtain a batch of actions as follows:

obs\_tensor \= torch.as\_tensor(obs, dtype\=torch.float32)
actions \= pi\_net(obs\_tensor)

You Should Know

Don’t worry about it if this neural network stuff is unfamiliar to you—this tutorial will focus on RL, and not on the neural network side of things. So you can skip this example and come back to it later. But we figured that if you already knew, it could be helpful.

#### Stochastic Policies[¶](#stochastic-policies "Permalink to this headline")

The two most common kinds of stochastic policies in deep RL are **categorical policies** and **diagonal Gaussian policies**.

[Categorical](https://en.wikipedia.org/wiki/Categorical_distribution) policies can be used in discrete action spaces, while diagonal [Gaussian](https://en.wikipedia.org/wiki/Multivariate_normal_distribution) policies are used in continuous action spaces.

Two key computations are centrally important for using and training stochastic policies:

*   sampling actions from the policy,
*   and computing log likelihoods of particular actions, ![\\log \\pi\_{\\theta}(a|s)](https://spinningup.openai.com/en/latest/_images/math/cc2095cba170e09137c55cb4f1786955b3174336.svg).

In what follows, we’ll describe how to do these for both categorical and diagonal Gaussian policies.

Categorical Policies

A categorical policy is like a classifier over discrete actions. You build the neural network for a categorical policy the same way you would for a classifier: the input is the observation, followed by some number of layers (possibly convolutional or densely-connected, depending on the kind of input), and then you have one final linear layer that gives you logits for each action, followed by a [softmax](https://developers.google.com/machine-learning/crash-course/multi-class-neural-networks/softmax) to convert the logits into probabilities.

**Sampling.** Given the probabilities for each action, frameworks like PyTorch and Tensorflow have built-in tools for sampling. For example, see the documentation for [Categorical distributions in PyTorch](https://pytorch.org/docs/stable/distributions.html#categorical), [torch.multinomial](https://pytorch.org/docs/stable/torch.html#torch.multinomial), [tf.distributions.Categorical](https://www.tensorflow.org/versions/r1.15/api_docs/python/tf/distributions/Categorical), or [tf.multinomial](https://www.tensorflow.org/versions/r1.15/api_docs/python/tf/random/multinomial).

**Log-Likelihood.** Denote the last layer of probabilities as ![P\_{\\theta}(s)](https://spinningup.openai.com/en/latest/_images/math/5364a8661022d60da78f14c9bd33124118719454.svg). It is a vector with however many entries as there are actions, so we can treat the actions as indices for the vector. The log likelihood for an action ![a](https://spinningup.openai.com/en/latest/_images/math/76a319586cd215c8f2075b938fc6f6e07c81714b.svg) can then be obtained by indexing into the vector:

![\\log \\pi\_{\\theta}(a|s) = \\log \\left\[P\_{\\theta}(s)\\right\]\_a.](https://spinningup.openai.com/en/latest/_images/math/ab8f7f4aaa7f1a3d1039ebdee058f297ed712c5a.svg)

Diagonal Gaussian Policies

A multivariate Gaussian distribution (or multivariate normal distribution, if you prefer) is described by a mean vector, ![\\mu](https://spinningup.openai.com/en/latest/_images/math/123eb57279cfbea38a65e8e129bda64972fedc3d.svg), and a covariance matrix, ![\\Sigma](https://spinningup.openai.com/en/latest/_images/math/f03ec2afde0e994f47df68b273d86e3afbfdce80.svg). A diagonal Gaussian distribution is a special case where the covariance matrix only has entries on the diagonal. As a result, we can represent it by a vector.

A diagonal Gaussian policy always has a neural network that maps from observations to mean actions, ![\\mu\_{\\theta}(s)](https://spinningup.openai.com/en/latest/_images/math/6923cb2043e84ea05d3eddbb7436c60659243cb9.svg). There are two different ways that the covariance matrix is typically represented.

**The first way:** There is a single vector of log standard deviations, ![\\log \\sigma](https://spinningup.openai.com/en/latest/_images/math/3276548e12065a40224719e967e02b1538d3c6b2.svg), which is **not** a function of state: the ![\\log \\sigma](https://spinningup.openai.com/en/latest/_images/math/3276548e12065a40224719e967e02b1538d3c6b2.svg) are standalone parameters. (You Should Know: our implementations of VPG, TRPO, and PPO do it this way.)

**The second way:** There is a neural network that maps from states to log standard deviations, ![\\log \\sigma\_{\\theta}(s)](https://spinningup.openai.com/en/latest/_images/math/4015c2b584427ca2a76f50ed03b2c8d0b5b3b350.svg). It may optionally share some layers with the mean network.

Note that in both cases we output log standard deviations instead of standard deviations directly. This is because log stds are free to take on any values in ![(-\\infty, \\infty)](https://spinningup.openai.com/en/latest/_images/math/9954b39a284ca1aa0aed2dc3f769404cc4e9f397.svg), while stds must be nonnegative. It’s easier to train parameters if you don’t have to enforce those kinds of constraints. The standard deviations can be obtained immediately from the log standard deviations by exponentiating them, so we do not lose anything by representing them this way.

**Sampling.** Given the mean action ![\\mu\_{\\theta}(s)](https://spinningup.openai.com/en/latest/_images/math/6923cb2043e84ea05d3eddbb7436c60659243cb9.svg) and standard deviation ![\\sigma\_{\\theta}(s)](https://spinningup.openai.com/en/latest/_images/math/cd6cc1a1e8ed7fc447a2ea0e59ad848707631c94.svg), and a vector ![z](https://spinningup.openai.com/en/latest/_images/math/886f88801abbe687ef8480ddd980f4215d2aaa17.svg) of noise from a spherical Gaussian (![z \\sim \\mathcal{N}(0, I)](https://spinningup.openai.com/en/latest/_images/math/a5a922f10e8b343418b1600a9a1601183673d126.svg)), an action sample can be computed with

![a = \\mu\_{\\theta}(s) + \\sigma\_{\\theta}(s) \\odot z,](https://spinningup.openai.com/en/latest/_images/math/b18a4163a861b1fc18c6a6824af3f5540d4e2468.svg)

where ![\\odot](https://spinningup.openai.com/en/latest/_images/math/77c323f00609b53862181c31bf0d045c75b29440.svg) denotes the elementwise product of two vectors. Standard frameworks have built-in ways to generate the noise vectors, such as [torch.normal](https://pytorch.org/docs/stable/torch.html#torch.normal) or [tf.random\_normal](https://www.tensorflow.org/versions/r1.15/api_docs/python/tf/random/normal). Alternatively, you can build distribution objects, eg through [torch.distributions.Normal](https://pytorch.org/docs/stable/distributions.html#normal) or [tf.distributions.Normal](https://www.tensorflow.org/versions/r1.15/api_docs/python/tf/distributions/Normal), and use them to generate samples. (The advantage of the latter approach is that those objects can also calculate log-likelihoods for you.)

**Log-Likelihood.** The log-likelihood of a ![k](https://spinningup.openai.com/en/latest/_images/math/a29aa94bd66ac7a6bb3195233fd9a9df8575af86.svg) -dimensional action ![a](https://spinningup.openai.com/en/latest/_images/math/76a319586cd215c8f2075b938fc6f6e07c81714b.svg), for a diagonal Gaussian with mean ![\\mu = \\mu\_{\\theta}(s)](https://spinningup.openai.com/en/latest/_images/math/0b9672dcfd65483d710b61a359dcabea32dab1f6.svg) and standard deviation ![\\sigma = \\sigma\_{\\theta}(s)](https://spinningup.openai.com/en/latest/_images/math/20acc318d574242ee023ecdb36f3651847016480.svg), is given by

![\\log \\pi\_{\\theta}(a|s) = -\\frac{1}{2}\\left(\\sum\_{i=1}^k \\left(\\frac{(a\_i - \\mu\_i)^2}{\\sigma\_i^2} + 2 \\log \\sigma\_i \\right) + k \\log 2\\pi \\right).](https://spinningup.openai.com/en/latest/_images/math/26f82323a4055444b30fa791238ec90913a12d7b.svg)

### Trajectories[¶](#trajectories "Permalink to this headline")

A trajectory ![\\tau](https://spinningup.openai.com/en/latest/_images/math/67a5412645decf6424bdd97aed3e9e7601bd784f.svg) is a sequence of states and actions in the world,

![\\tau = (s\_0, a\_0, s\_1, a\_1, ...).](https://spinningup.openai.com/en/latest/_images/math/8337d86159a1cd98dfcd0601993d7b6b2fbb54d9.svg)

The very first state of the world, ![s\_0](https://spinningup.openai.com/en/latest/_images/math/bf047f4b5c542c1bfbaf4bf411919f5e1f7ecba8.svg), is randomly sampled from the **start-state distribution**, sometimes denoted by ![\\rho\_0](https://spinningup.openai.com/en/latest/_images/math/2d44ad6f01d4e56266daa8e3b35bd4f298e25788.svg):

![s\_0 \\sim \\rho\_0(\\cdot).](https://spinningup.openai.com/en/latest/_images/math/eef23a6502b9cec4bc399bcbce93547c3723643c.svg)

State transitions (what happens to the world between the state at time ![t](https://spinningup.openai.com/en/latest/_images/math/7ed8f1921a380f7a5f45b87825838fdced658554.svg), ![s\_t](https://spinningup.openai.com/en/latest/_images/math/4fcf0bf03c2a691496ce04ade269159d8b89caa5.svg), and the state at ![t+1](https://spinningup.openai.com/en/latest/_images/math/55c6e4a64640ac5e7b4da87ff4bcf12da93ef252.svg), ![s\_{t+1}](https://spinningup.openai.com/en/latest/_images/math/4b669c18a22476afbab2c49bb68525256b416cff.svg)), are governed by the natural laws of the environment, and depend on only the most recent action, ![a\_t](https://spinningup.openai.com/en/latest/_images/math/39079fcebc9eb2aba4ab3fe7359b34807ceccc0e.svg). They can be either deterministic,

![s\_{t+1} = f(s\_t, a\_t)](https://spinningup.openai.com/en/latest/_images/math/16da6346104894fb6a673473cbfc9ffeba6471fa.svg)

or stochastic,

![s\_{t+1} \\sim P(\\cdot|s\_t, a\_t).](https://spinningup.openai.com/en/latest/_images/math/872390af4f5b2541d17e7ef2bfaecbe1e9746d94.svg)

Actions come from an agent according to its policy.

You Should Know

Trajectories are also frequently called **episodes** or **rollouts**.

### Reward and Return[¶](#reward-and-return "Permalink to this headline")

The reward function ![R](https://spinningup.openai.com/en/latest/_images/math/1f9d30d011e9fe548e999c9bfcf3fccfa27ec3ff.svg) is critically important in reinforcement learning. It depends on the current state of the world, the action just taken, and the next state of the world:

![r\_t = R(s\_t, a\_t, s\_{t+1})](https://spinningup.openai.com/en/latest/_images/math/6ed565b0911f12c8ef64d93a617d8bb30380d5d5.svg)

although frequently this is simplified to just a dependence on the current state, ![r\_t = R(s\_t)](https://spinningup.openai.com/en/latest/_images/math/4befde40a79499d3655bebda93423e2661036f0d.svg), or state-action pair ![r\_t = R(s\_t,a\_t)](https://spinningup.openai.com/en/latest/_images/math/3a66e4711a16a69ca64bd10d96985363d6e4bc5c.svg).

The goal of the agent is to maximize some notion of cumulative reward over a trajectory, but this actually can mean a few things. We’ll notate all of these cases with ![R(\\tau)](https://spinningup.openai.com/en/latest/_images/math/c2d6738c058406ade40dcf870311db157ed80e0f.svg), and it will either be clear from context which case we mean, or it won’t matter (because the same equations will apply to all cases).

One kind of return is the **finite-horizon undiscounted return**, which is just the sum of rewards obtained in a fixed window of steps:

![R(\\tau) = \\sum\_{t=0}^T r\_t.](https://spinningup.openai.com/en/latest/_images/math/b2466507811fc9b9cbe2a0a51fd36034e16f2780.svg)

Another kind of return is the **infinite-horizon discounted return**, which is the sum of all rewards _ever_ obtained by the agent, but discounted by how far off in the future they’re obtained. This formulation of reward includes a discount factor ![\\gamma \\in (0,1)](https://spinningup.openai.com/en/latest/_images/math/7c0000152970a235979a501b70bd05c781a8b1ec.svg):

![R(\\tau) = \\sum\_{t=0}^{\\infty} \\gamma^t r\_t.](https://spinningup.openai.com/en/latest/_images/math/bf49428c66c91a45d7b66a432450ee49a3622348.svg)

Why would we ever want a discount factor, though? Don’t we just want to get _all_ rewards? We do, but the discount factor is both intuitively appealing and mathematically convenient. On an intuitive level: cash now is better than cash later. Mathematically: an infinite-horizon sum of rewards [may not converge](https://en.wikipedia.org/wiki/Convergent_series) to a finite value, and is hard to deal with in equations. But with a discount factor and under reasonable conditions, the infinite sum converges.

You Should Know

While the line between these two formulations of return are quite stark in RL formalism, deep RL practice tends to blur the line a fair bit—for instance, we frequently set up algorithms to optimize the undiscounted return, but use discount factors in estimating **value functions**.

### The RL Problem[¶](#the-rl-problem "Permalink to this headline")

Whatever the choice of return measure (whether infinite-horizon discounted, or finite-horizon undiscounted), and whatever the choice of policy, the goal in RL is to select a policy which maximizes **expected return** when the agent acts according to it.

To talk about expected return, we first have to talk about probability distributions over trajectories.

Let’s suppose that both the environment transitions and the policy are stochastic. In this case, the probability of a ![T](https://spinningup.openai.com/en/latest/_images/math/844fe92e58a680253626f9b0706a06c578a4e040.svg) -step trajectory is:

![P(\\tau|\\pi) = \\rho\_0 (s\_0) \\prod\_{t=0}^{T-1} P(s\_{t+1} | s\_t, a\_t) \\pi(a\_t | s\_t).](https://spinningup.openai.com/en/latest/_images/math/69369e7fae3098a2f05a79680fbecbf48a4e7f66.svg)

The expected return (for whichever measure), denoted by ![J(\\pi)](https://spinningup.openai.com/en/latest/_images/math/89397c4cc47a40c3466507e1330dc380458f762e.svg), is then:

![J(\\pi) = \\int\_{\\tau} P(\\tau|\\pi) R(\\tau) = \\underE{\\tau\\sim \\pi}{R(\\tau)}.](https://spinningup.openai.com/en/latest/_images/math/f0d6e3879540e318df14d2c8b68af828b1b350da.svg)

The central optimization problem in RL can then be expressed by

![\\pi^\* = \\arg \\max\_{\\pi} J(\\pi),](https://spinningup.openai.com/en/latest/_images/math/2de61070bf8758d03104b4f15df45c8ff5a86f5a.svg)

with ![\\pi^\*](https://spinningup.openai.com/en/latest/_images/math/1fbf259ac070c92161e32b93c0f64705a8f18f0a.svg) being the **optimal policy**.

### Value Functions[¶](#value-functions "Permalink to this headline")

It’s often useful to know the **value** of a state, or state-action pair. By value, we mean the expected return if you start in that state or state-action pair, and then act according to a particular policy forever after. **Value functions** are used, one way or another, in almost every RL algorithm.

There are four main functions of note here.

1.  The **On-Policy Value Function**, ![V^{\\pi}(s)](https://spinningup.openai.com/en/latest/_images/math/a81303323c25fc13cd0652ca46d7596276e5cb7e.svg), which gives the expected return if you start in state ![s](https://spinningup.openai.com/en/latest/_images/math/96ac51b9afe79581e48f2f3f0ad3faa0f4402cc7.svg) and always act according to policy ![\\pi](https://spinningup.openai.com/en/latest/_images/math/1ae2bd722da01b3a89ffc139af2437c28364a966.svg):
    
    > ![V^{\\pi}(s) = \\underE{\\tau \\sim \\pi}{R(\\tau)\\left| s\_0 = s\\right.}](https://spinningup.openai.com/en/latest/_images/math/e043709b46c9aa6811953dabd82461db6308fe19.svg)
    
2.  The **On-Policy Action-Value Function**, ![Q^{\\pi}(s,a)](https://spinningup.openai.com/en/latest/_images/math/86549c5748a6fdd134970fd88f4842bd862a8b25.svg), which gives the expected return if you start in state ![s](https://spinningup.openai.com/en/latest/_images/math/96ac51b9afe79581e48f2f3f0ad3faa0f4402cc7.svg), take an arbitrary action ![a](https://spinningup.openai.com/en/latest/_images/math/76a319586cd215c8f2075b938fc6f6e07c81714b.svg) (which may not have come from the policy), and then forever after act according to policy ![\\pi](https://spinningup.openai.com/en/latest/_images/math/1ae2bd722da01b3a89ffc139af2437c28364a966.svg):
    
    > ![Q^{\\pi}(s,a) = \\underE{\\tau \\sim \\pi}{R(\\tau)\\left| s\_0 = s, a\_0 = a\\right.}](https://spinningup.openai.com/en/latest/_images/math/85d41c8c383a96e1ed34fc66f14abd61b132dd28.svg)
    
3.  The **Optimal Value Function**, ![V^\*(s)](https://spinningup.openai.com/en/latest/_images/math/6159ad57fb5294b812e76c6260a65dc5ffa2a5f7.svg), which gives the expected return if you start in state ![s](https://spinningup.openai.com/en/latest/_images/math/96ac51b9afe79581e48f2f3f0ad3faa0f4402cc7.svg) and always act according to the _optimal_ policy in the environment:
    
    > ![V^\*(s) = \\max\_{\\pi} \\underE{\\tau \\sim \\pi}{R(\\tau)\\left| s\_0 = s\\right.}](https://spinningup.openai.com/en/latest/_images/math/01d48ea453ecb7b560ea7d42144ae24422fbd0eb.svg)
    
4.  The **Optimal Action-Value Function**, ![Q^\*(s,a)](https://spinningup.openai.com/en/latest/_images/math/cbed396f671d6fb54f6df5c044b82ab3f052d63e.svg), which gives the expected return if you start in state ![s](https://spinningup.openai.com/en/latest/_images/math/96ac51b9afe79581e48f2f3f0ad3faa0f4402cc7.svg), take an arbitrary action ![a](https://spinningup.openai.com/en/latest/_images/math/76a319586cd215c8f2075b938fc6f6e07c81714b.svg), and then forever after act according to the _optimal_ policy in the environment:
    
    > ![Q^\*(s,a) = \\max\_{\\pi} \\underE{\\tau \\sim \\pi}{R(\\tau)\\left| s\_0 = s, a\_0 = a\\right.}](https://spinningup.openai.com/en/latest/_images/math/bc92e8ce1cf0aaa212e144d5ed74e3b115453cb6.svg)
    

You Should Know

When we talk about value functions, if we do not make reference to time-dependence, we only mean expected **infinite-horizon discounted return**. Value functions for finite-horizon undiscounted return would need to accept time as an argument. Can you think about why? Hint: what happens when time’s up?

You Should Know

There are two key connections between the value function and the action-value function that come up pretty often:

![V^{\\pi}(s) = \\underE{a\\sim \\pi}{Q^{\\pi}(s,a)},](https://spinningup.openai.com/en/latest/_images/math/5151391b2cd2bfa909a3b5a057b6c93d4191790b.svg)

and

![V^\*(s) = \\max\_a Q^\* (s,a).](https://spinningup.openai.com/en/latest/_images/math/4cbd255e1ecc9f7083034be12148e8b98cefc2ee.svg)

These relations follow pretty directly from the definitions just given: can you prove them?

### The Optimal Q-Function and the Optimal Action[¶](#the-optimal-q-function-and-the-optimal-action "Permalink to this headline")

There is an important connection between the optimal action-value function ![Q^\*(s,a)](https://spinningup.openai.com/en/latest/_images/math/cbed396f671d6fb54f6df5c044b82ab3f052d63e.svg) and the action selected by the optimal policy. By definition, ![Q^\*(s,a)](https://spinningup.openai.com/en/latest/_images/math/cbed396f671d6fb54f6df5c044b82ab3f052d63e.svg) gives the expected return for starting in state ![s](https://spinningup.openai.com/en/latest/_images/math/96ac51b9afe79581e48f2f3f0ad3faa0f4402cc7.svg), taking (arbitrary) action ![a](https://spinningup.openai.com/en/latest/_images/math/76a319586cd215c8f2075b938fc6f6e07c81714b.svg), and then acting according to the optimal policy forever after.

The optimal policy in ![s](https://spinningup.openai.com/en/latest/_images/math/96ac51b9afe79581e48f2f3f0ad3faa0f4402cc7.svg) will select whichever action maximizes the expected return from starting in ![s](https://spinningup.openai.com/en/latest/_images/math/96ac51b9afe79581e48f2f3f0ad3faa0f4402cc7.svg). As a result, if we have ![Q^\*](https://spinningup.openai.com/en/latest/_images/math/c2e969d09ae88d847429eac9a8494cc89cabe4bd.svg), we can directly obtain the optimal action, ![a^\*(s)](https://spinningup.openai.com/en/latest/_images/math/baf715aa6a295b7b7d85e1e1123552c5ae705756.svg), via

![a^\*(s) = \\arg \\max\_a Q^\* (s,a).](https://spinningup.openai.com/en/latest/_images/math/42490c4d812c9ca1fc226684577900bc8bdd609b.svg)

Note: there may be multiple actions which maximize ![Q^\*(s,a)](https://spinningup.openai.com/en/latest/_images/math/cbed396f671d6fb54f6df5c044b82ab3f052d63e.svg), in which case, all of them are optimal, and the optimal policy may randomly select any of them. But there is always an optimal policy which deterministically selects an action.

### Bellman Equations[¶](#bellman-equations "Permalink to this headline")

All four of the value functions obey special self-consistency equations called **Bellman equations**. The basic idea behind the Bellman equations is this:

> The value of your starting point is the reward you expect to get from being there, plus the value of wherever you land next.

The Bellman equations for the on-policy value functions are

![\\begin{align\*}
V^{\\pi}(s) &= \\underE{a \\sim \\pi \\\\ s'\\sim P}{r(s,a) + \\gamma V^{\\pi}(s')}, \\\\
Q^{\\pi}(s,a) &= \\underE{s'\\sim P}{r(s,a) + \\gamma \\underE{a'\\sim \\pi}{Q^{\\pi}(s',a')}},
\\end{align\*}](https://spinningup.openai.com/en/latest/_images/math/7e4a2964e190104a669406ca5e1e320a5da8bae0.svg)

where ![s' \\sim P](https://spinningup.openai.com/en/latest/_images/math/411171ab57c4bec0d86c9f4b495106ba5d73decc.svg) is shorthand for ![s' \\sim P(\\cdot |s,a)](https://spinningup.openai.com/en/latest/_images/math/ed45f9d37dbb092727104773ca3a464d46f892b8.svg), indicating that the next state ![s'](https://spinningup.openai.com/en/latest/_images/math/6e85fa05d4954e7c1e8037ee1bd163d15bc2e2d6.svg) is sampled from the environment’s transition rules; ![a \\sim \\pi](https://spinningup.openai.com/en/latest/_images/math/e87025074e03131c69c6c5758e873a6224ea5d3a.svg) is shorthand for ![a \\sim \\pi(\\cdot|s)](https://spinningup.openai.com/en/latest/_images/math/35c684d9cc672fd0bbacd896f49abdd986f40b02.svg); and ![a' \\sim \\pi](https://spinningup.openai.com/en/latest/_images/math/b3f46cc6cd6c2fa9068013fafbe1b4b029bb8a58.svg) is shorthand for ![a' \\sim \\pi(\\cdot|s')](https://spinningup.openai.com/en/latest/_images/math/6eb25f9175aa0471d7a7728ab237a92fef5009e9.svg).

The Bellman equations for the optimal value functions are

![\\begin{align\*}
V^\*(s) &= \\max\_a \\underE{s'\\sim P}{r(s,a) + \\gamma V^\*(s')}, \\\\
Q^\*(s,a) &= \\underE{s'\\sim P}{r(s,a) + \\gamma \\max\_{a'} Q^\*(s',a')}.
\\end{align\*}](https://spinningup.openai.com/en/latest/_images/math/f8ab9b211bc9bb91cde189360051e3bd1f896afa.svg)

The crucial difference between the Bellman equations for the on-policy value functions and the optimal value functions, is the absence or presence of the ![\\max](https://spinningup.openai.com/en/latest/_images/math/a52117d0fa54eb8449482447cad9c0ab54c757cc.svg) over actions. Its inclusion reflects the fact that whenever the agent gets to choose its action, in order to act optimally, it has to pick whichever action leads to the highest value.

You Should Know

The term “Bellman backup” comes up quite frequently in the RL literature. The Bellman backup for a state, or state-action pair, is the right-hand side of the Bellman equation: the reward-plus-next-value.

### Advantage Functions[¶](#advantage-functions "Permalink to this headline")

Sometimes in RL, we don’t need to describe how good an action is in an absolute sense, but only how much better it is than others on average. That is to say, we want to know the relative **advantage** of that action. We make this concept precise with the **advantage function.**

The advantage function ![A^{\\pi}(s,a)](https://spinningup.openai.com/en/latest/_images/math/09f82f133e9f89a59ba22266639c4968b5641c28.svg) corresponding to a policy ![\\pi](https://spinningup.openai.com/en/latest/_images/math/1ae2bd722da01b3a89ffc139af2437c28364a966.svg) describes how much better it is to take a specific action ![a](https://spinningup.openai.com/en/latest/_images/math/76a319586cd215c8f2075b938fc6f6e07c81714b.svg) in state ![s](https://spinningup.openai.com/en/latest/_images/math/96ac51b9afe79581e48f2f3f0ad3faa0f4402cc7.svg), over randomly selecting an action according to ![\\pi(\\cdot|s)](https://spinningup.openai.com/en/latest/_images/math/8d2c2c23f74e7a0cf98b0ee1de016825eb50e2d4.svg), assuming you act according to ![\\pi](https://spinningup.openai.com/en/latest/_images/math/1ae2bd722da01b3a89ffc139af2437c28364a966.svg) forever after. Mathematically, the advantage function is defined by

![A^{\\pi}(s,a) = Q^{\\pi}(s,a) - V^{\\pi}(s).](https://spinningup.openai.com/en/latest/_images/math/3748974cc061fb4065fa46dd6271395d59f22040.svg)

You Should Know

We’ll discuss this more later, but the advantage function is crucially important to policy gradient methods.

## [(Optional) Formalism](#id5)[¶](#optional-formalism "Permalink to this headline")

So far, we’ve discussed the agent’s environment in an informal way, but if you try to go digging through the literature, you’re likely to run into the standard mathematical formalism for this setting: **Markov Decision Processes** (MDPs). An MDP is a 5-tuple, ![\\langle S, A, R, P, \\rho\_0 \\rangle](https://spinningup.openai.com/en/latest/_images/math/a7e1a4549f45dc56849b1ff857a19a71f9cc02a6.svg), where

The name Markov Decision Process refers to the fact that the system obeys the [Markov property](https://en.wikipedia.org/wiki/Markov_property): transitions only depend on the most recent state and action, and no prior history.