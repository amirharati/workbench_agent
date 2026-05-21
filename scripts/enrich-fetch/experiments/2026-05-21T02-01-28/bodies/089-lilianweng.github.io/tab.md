\[Updated on 2018-06-30: add two new policy gradient methods, [SAC](#sac) and [D4PG](#d4pg).\]  
\[Updated on 2018-09-30: add a new policy gradient method, [TD3](#td3).\]  
\[Updated on 2019-02-09: add [SAC with automatically adjusted temperature](#sac-with-automatically-adjusted-temperature)\].  
\[Updated on 2019-06-26: Thanks to Chanseok, we have a version of this post in [Korean](https://talkingaboutme.tistory.com/entry/RL-Policy-Gradient-Algorithms)\].  
\[Updated on 2019-09-12: add a new policy gradient method [SVPG](#svpg).\]  
\[Updated on 2019-12-22: add a new policy gradient method [IMPALA](#impala).\]  
\[Updated on 2020-10-15: add a new policy gradient method [PPG](#ppg) & some new discussion in [PPO](#ppo).\]  
\[Updated on 2021-09-19: Thanks to Wenhao & 爱吃猫的鱼, we have this post in [Chinese1](https://tomaxent.com/2019/04/14/%E7%AD%96%E7%95%A5%E6%A2%AF%E5%BA%A6%E6%96%B9%E6%B3%95/) & [Chinese2](https://paperexplained.cn/articles/article/detail/31/)\].

## What is Policy Gradient

Policy gradient is an approach to solve reinforcement learning problems. If you haven’t looked into the field of reinforcement learning, please first read the section [“A (Long) Peek into Reinforcement Learning » Key Concepts”](https://lilianweng.github.io/posts/2018-02-19-rl-overview/#key-concepts) for the problem definition and key concepts.

## Notations

Here is a list of notations to help you read through equations in the post easily.

Symbol

Meaning

s∈S

States.

a∈A

Actions.

r∈R

Rewards.

St,At,Rt

State, action, and reward at time step t of one trajectory. I may occasionally use st,at,rt as well.

γ

Discount factor; penalty to uncertainty of future rewards; 0<γ≤1.

Gt

Return; or discounted future reward; Gt\=∑k\=0∞γkRt+k+1.

P(s′,r|s,a)

Transition probability of getting to the next state s′ from the current state s with action a and reward r.

π(a|s)

Stochastic policy (agent behavior strategy); πθ(.) is a policy parameterized by θ.

μ(s)

Deterministic policy; we can also label this as π(s), but using a different letter gives better distinction so that we can easily tell when the policy is stochastic or deterministic without further explanation. Either π or μ is what a reinforcement learning algorithm aims to learn.

V(s)

State-value function measures the expected return of state s; Vw(.) is a value function parameterized by w.

Vπ(s)

The value of state s when we follow a policy π; Vπ(s)\=Ea∼π\[Gt|St\=s\].

Q(s,a)

Action-value function is similar to V(s), but it assesses the expected return of a pair of state and action (s,a); Qw(.) is a action value function parameterized by w.

Qπ(s,a)

Similar to Vπ(.), the value of (state, action) pair when we follow a policy π; Qπ(s,a)\=Ea∼π\[Gt|St\=s,At\=a\].

A(s,a)

Advantage function, A(s,a)\=Q(s,a)−V(s); it can be considered as another version of Q-value with lower variance by taking the state-value off as the baseline.

The goal of reinforcement learning is to find an optimal behavior strategy for the agent to obtain optimal rewards. The **policy gradient** methods target at modeling and optimizing the policy directly. The policy is usually modeled with a parameterized function respect to , . The value of the reward (objective) function depends on this policy and then various algorithms can be applied to optimize for the best reward.

The reward function is defined as:

where is the stationary distribution of Markov chain for (on-policy state distribution under ). For simplicity, the parameter would be omitted for the policy when the policy is present in the subscript of other functions; for example, and should be and if written in full.

Imagine that you can travel along the Markov chain’s states forever, and eventually, as the time progresses, the probability of you ending up with one state becomes unchanged — this is the stationary probability for . is the probability that when starting from and following policy for t steps. Actually, the existence of the stationary distribution of Markov chain is one main reason for why PageRank algorithm works. If you want to read more, check [this](https://jeremykun.com/2015/04/06/markov-chain-monte-carlo-without-all-the-bullshit/).

It is natural to expect policy-based methods are more useful in the continuous space. Because there is an infinite number of actions and (or) states to estimate the values for and hence value-based approaches are way too expensive computationally in the continuous space. For example, in [generalized policy iteration](https://lilianweng.github.io/posts/2018-02-19-rl-overview/#policy-iteration), the policy improvement step requires a full scan of the action space, suffering from the [curse of dimensionality](https://en.wikipedia.org/wiki/Curse_of_dimensionality).

Using _gradient ascent_, we can move toward the direction suggested by the gradient to find the best for that produces the highest return.

## Policy Gradient Theorem

Computing the gradient is tricky because it depends on both the action selection (directly determined by ) and the stationary distribution of states following the target selection behavior (indirectly determined by ). Given that the environment is generally unknown, it is difficult to estimate the effect on the state distribution by a policy update.

Luckily, the **policy gradient theorem** comes to save the world! Woohoo! It provides a nice reformation of the derivative of the objective function to not involve the derivative of the state distribution and simplify the gradient computation a lot.

## Proof of Policy Gradient Theorem

This session is pretty dense, as it is the time for us to go through the proof ([Sutton & Barto, 2017](http://incompleteideas.net/book/bookdraft2017nov5.pdf); Sec. 13.1) and figure out why the policy gradient theorem is correct.

We first start with the derivative of the state value function:

Now we have:

This equation has a nice recursive form (see the red parts!) and the future state value function can be repeated unrolled by following the same equation.

Let’s consider the following visitation sequence and label the probability of transitioning from state s to state x with policy after k step as .

*   When k = 0: .
*   When k = 1, we scan through all possible actions and sum up the transition probabilities to the target state: .
*   Imagine that the goal is to go from state s to x after k+1 steps while following policy . We can first travel from s to a middle point s’ (any state can be a middle point, ) after k steps and then go to the final state x during the last step. In this way, we are able to update the visitation probability recursively: .

Then we go back to unroll the recursive representation of ! Let to simplify the maths. If we keep on extending infinitely, it is easy to find out that we can transition from the starting state s to any state after any number of steps in this unrolling process and by summing up all the visitation probabilities, we get !

The nice rewriting above allows us to exclude the derivative of Q-value function, . By plugging it into the objective function , we are getting the following:

In the episodic case, the constant of proportionality () is the average length of an episode; in the continuing case, it is 1 ([Sutton & Barto, 2017](http://incompleteideas.net/book/bookdraft2017nov5.pdf); Sec. 13.2). The gradient can be further written as:

Where refers to when both state and action distributions follow the policy (on policy).

The policy gradient theorem lays the theoretical foundation for various policy gradient algorithms. This vanilla policy gradient update has no bias but high variance. Many following algorithms were proposed to reduce the variance while keeping the bias unchanged.

Here is a nice summary of a general form of policy gradient methods borrowed from the [GAE](https://arxiv.org/pdf/1506.02438.pdf) (general advantage estimation) paper ([Schulman et al., 2016](https://arxiv.org/abs/1506.02438)) and this [post](https://danieltakeshi.github.io/2017/04/02/notes-on-the-generalized-advantage-estimation-paper/) thoroughly discussed several components in GAE , highly recommended.

![](https://lilianweng.github.io/posts/general_form_policy_gradient.png)

A general form of policy gradient methods. (Image source: [Schulman et al., 2016](https://arxiv.org/abs/1506.02438))

## Policy Gradient Algorithms

Tons of policy gradient algorithms have been proposed during recent years and there is no way for me to exhaust them. I’m introducing some of them that I happened to know and read about.

## REINFORCE

**REINFORCE** (Monte-Carlo policy gradient) relies on an estimated return by [Monte-Carlo](https://lilianweng.github.io/posts/2018-02-19-rl-overview/#monte-carlo-methods) methods using episode samples to update the policy parameter . REINFORCE works because the expectation of the sample gradient is equal to the actual gradient:

Therefore we are able to measure from real sample trajectories and use that to update our policy gradient. It relies on a full trajectory and that’s why it is a Monte-Carlo method.

The process is pretty straightforward:

1.  Initialize the policy parameter at random.
2.  Generate one trajectory on policy : .
3.  For t=1, 2, … , T:
    1.  Estimate the the return ;
    2.  Update policy parameters:

A widely used variation of REINFORCE is to subtract a baseline value from the return to _reduce the variance of gradient estimation while keeping the bias unchanged_ (Remember we always want to do this when possible). For example, a common baseline is to subtract state-value from action-value, and if applied, we would use advantage in the gradient ascent update. This [post](https://danieltakeshi.github.io/2017/03/28/going-deeper-into-reinforcement-learning-fundamentals-of-policy-gradients/) nicely explained why a baseline works for reducing the variance, in addition to a set of fundamentals of policy gradient.

## Actor-Critic

Two main components in policy gradient are the policy model and the value function. It makes a lot of sense to learn the value function in addition to the policy, since knowing the value function can assist the policy update, such as by reducing gradient variance in vanilla policy gradients, and that is exactly what the **Actor-Critic** method does.

Actor-critic methods consist of two models, which may optionally share parameters:

*   **Critic** updates the value function parameters w and depending on the algorithm it could be action-value or state-value .
*   **Actor** updates the policy parameters for , in the direction suggested by the critic.

Let’s see how it works in a simple action-value actor-critic algorithm.

1.  Initialize at random; sample .
2.  For :
    1.  Sample reward and next state ;
    2.  Then sample the next action ;
    3.  Update the policy parameters: ;
    4.  Compute the correction (TD error) for action-value at time t:  
          
        and use it to update the parameters of action-value function:  
        
    5.  Update and .

Two learning rates, and , are predefined for policy and value function parameter updates respectively.

## Off-Policy Policy Gradient

Both REINFORCE and the vanilla version of actor-critic method are on-policy: training samples are collected according to the target policy — the very same policy that we try to optimize for. Off policy methods, however, result in several additional advantages:

1.  The off-policy approach does not require full trajectories and can reuse any past episodes ([“experience replay”](https://lilianweng.github.io/posts/2018-02-19-rl-overview/#deep-q-network)) for much better sample efficiency.
2.  The sample collection follows a behavior policy different from the target policy, bringing better [exploration](https://lilianweng.github.io/posts/2018-02-19-rl-overview/#exploration-exploitation-dilemma).

Now let’s see how off-policy policy gradient is computed. The behavior policy for collecting samples is a known policy (predefined just like a hyperparameter), labelled as . The objective function sums up the reward over the state distribution defined by this behavior policy:

where is the stationary distribution of the behavior policy ; recall that ; and is the action-value function estimated with regard to the target policy (not the behavior policy!).

Given that the training observations are sampled by , we can rewrite the gradient as:

where is the [importance weight](http://timvieira.github.io/blog/post/2014/12/21/importance-sampling/). Because is a function of the target policy and thus a function of policy parameter , we should take the derivative of as well according to the product rule. However, it is super hard to compute in reality. Fortunately if we use an approximated gradient with the gradient of Q ignored, we still guarantee the policy improvement and eventually achieve the true local minimum. This is justified in the proof [here](https://arxiv.org/pdf/1205.4839.pdf) (Degris, White & Sutton, 2012).

In summary, when applying policy gradient in the off-policy setting, we can simple adjust it with a weighted sum and the weight is the ratio of the target policy to the behavior policy, .

## A3C

\[[paper](https://arxiv.org/abs/1602.01783)|[code](https://github.com/dennybritz/reinforcement-learning/tree/master/PolicyGradient/a3c)\]

**Asynchronous Advantage Actor-Critic** ([Mnih et al., 2016](https://arxiv.org/abs/1602.01783)), short for **A3C**, is a classic policy gradient method with a special focus on parallel training.

In A3C, the critics learn the value function while multiple actors are trained in parallel and get synced with global parameters from time to time. Hence, A3C is designed to work well for parallel training.

Let’s use the state-value function as an example. The loss function for state value is to minimize the mean squared error, and gradient descent can be applied to find the optimal w. This state-value function is used as the baseline in the policy gradient update.

Here is the algorithm outline:

1.  We have global parameters, and ; similar thread-specific parameters, and .
    
2.  Initialize the time step
    
3.  While :
    
    1.  Reset gradient: and .
    2.  Synchronize thread-specific parameters with global ones: and .
    3.  \= t and sample a starting state .
    4.  While ( != TERMINAL) and :
        1.  Pick the action and receive a new reward and a new state .
        2.  Update and
    5.  Initialize the variable that holds the return estimation
    
    6\. For : 1. ; here R is a MC measure of . 2. Accumulate gradients w.r.t. : ;  
    Accumulate gradients w.r.t. w': .
    7.  Update asynchronously using , and using .

A3C enables the parallelism in multiple agent training. The gradient accumulation step (6.2) can be considered as a parallelized reformation of minibatch-based stochastic gradient update: the values of or get corrected by a little bit in the direction of each training thread independently.

## A2C

\[[paper](https://arxiv.org/abs/1602.01783)|[code](https://github.com/openai/baselines/blob/master/baselines/a2c/a2c.py)\]

**A2C** is a synchronous, deterministic version of A3C; that’s why it is named as “A2C” with the first “A” (“asynchronous”) removed. In A3C each agent talks to the global parameters independently, so it is possible sometimes the thread-specific agents would be playing with policies of different versions and therefore the aggregated update would not be optimal. To resolve the inconsistency, a coordinator in A2C waits for all the parallel actors to finish their work before updating the global parameters and then in the next iteration parallel actors starts from the same policy. The synchronized gradient update keeps the training more cohesive and potentially to make convergence faster.

A2C has been [shown](https://blog.openai.com/baselines-acktr-a2c/) to be able to utilize GPUs more efficiently and work better with large batch sizes while achieving same or better performance than A3C.

![](https://lilianweng.github.io/posts/A3C_vs_A2C.png)

The architecture of A3C versus A2C.

## DPG

\[[paper](https://hal.inria.fr/file/index/docid/938992/filename/dpg-icml2014.pdf)|code\]

In methods described above, the policy function is always modeled as a probability distribution over actions given the current state and thus it is _stochastic_. **Deterministic policy gradient (DPG)** instead models the policy as a deterministic decision: . It may look bizarre — how can you calculate the gradient of the action probability when it outputs a single action? Let’s look into it step by step.

Refresh on a few notations to facilitate the discussion:

*   : The initial distribution over states
*   : Starting from state s, the visitation probability density at state s’ after moving k steps by policy .
*   : Discounted state distribution, defined as .

The objective function to optimize for is listed as follows:

**Deterministic policy gradient theorem**: Now it is the time to compute the gradient! According to the chain rule, we first take the gradient of Q w.r.t. the action a and then take the gradient of the deterministic policy function w.r.t. :

We can consider the deterministic policy as a _special case_ of the stochastic one, when the probability distribution contains only one extreme non-zero value over one action. Actually, in the DPG [paper](https://hal.inria.fr/file/index/docid/938992/filename/dpg-icml2014.pdf), the authors have shown that if the stochastic policy is re-parameterized by a deterministic policy and a variation variable , the stochastic policy is eventually equivalent to the deterministic case when . Compared to the deterministic policy, we expect the stochastic policy to require more samples as it integrates the data over the whole state and action space.

The deterministic policy gradient theorem can be plugged into common policy gradient frameworks.

Let’s consider an example of on-policy actor-critic algorithm to showcase the procedure. In each iteration of on-policy actor-critic, two actions are taken deterministically and the [SARSA](https://lilianweng.github.io/posts/2018-02-19-rl-overview/#sarsa-on-policy-td-control) update on policy parameters relies on the new gradient that we just computed above:

However, unless there is sufficient noise in the environment, it is very hard to guarantee enough [exploration](https://lilianweng.github.io/posts/2018-02-19-rl-overview/#exploration-exploitation-dilemma) due to the determinacy of the policy. We can either add noise into the policy (ironically this makes it nondeterministic!) or learn it off-policy-ly by following a different stochastic behavior policy to collect samples.

Say, in the off-policy approach, the training trajectories are generated by a stochastic policy and thus the state distribution follows the corresponding discounted state density :

Note that because the policy is deterministic, we only need rather than as the estimated reward of a given state s. In the off-policy approach with a stochastic policy, importance sampling is often used to correct the mismatch between behavior and target policies, as what we have described [above](#off-policy-policy-gradient). However, because the deterministic policy gradient removes the integral over actions, we can avoid importance sampling.

## DDPG

\[[paper](https://arxiv.org/pdf/1509.02971.pdf)|[code](https://github.com/openai/baselines/tree/master/baselines/ddpg)\]

**DDPG** ([Lillicrap, et al., 2015](https://arxiv.org/pdf/1509.02971.pdf)), short for **Deep Deterministic Policy Gradient**, is a model-free off-policy actor-critic algorithm, combining [DPG](#dpg) with [DQN](https://lilianweng.github.io/posts/2018-02-19-rl-overview/#deep-q-network). Recall that DQN (Deep Q-Network) stabilizes the learning of Q-function by experience replay and the frozen target network. The original DQN works in discrete space, and DDPG extends it to continuous space with the actor-critic framework while learning a deterministic policy.

In order to do better exploration, an exploration policy is constructed by adding noise :

In addition, DDPG does soft updates (“conservative policy iteration”) on the parameters of both actor and critic, with : . In this way, the target network values are constrained to change slowly, different from the design in DQN that the target network stays frozen for some period of time.

One detail in the paper that is particularly useful in robotics is on how to normalize the different physical units of low dimensional features. For example, a model is designed to learn a policy with the robot’s positions and velocities as input; these physical statistics are different by nature and even statistics of the same type may vary a lot across multiple robots. [Batch normalization](http://proceedings.mlr.press/v37/ioffe15.pdf) is applied to fix it by normalizing every dimension across samples in one minibatch.

![](https://lilianweng.github.io/posts/DDPG_algo.png)

Fig 3. DDPG Algorithm. (Image source: [Lillicrap, et al., 2015](https://arxiv.org/pdf/1509.02971.pdf))

## D4PG

\[[paper](https://openreview.net/forum?id=SyZipzbCb)|code (Search “github d4pg” and you will see a few.)\]

**Distributed Distributional DDPG (D4PG)** applies a set of improvements on DDPG to make it run in the distributional fashion.

(1) **Distributional Critic**: The critic estimates the expected Q value as a random variable ~ a distribution parameterized by and therefore . The loss for learning the distribution parameter is to minimize some measure of the distance between two distributions — distributional TD error: , where is the Bellman operator.

The deterministic policy gradient update becomes:

(2) **\-step returns**: When calculating the TD error, D4PG computes -step TD target rather than one-step to incorporate rewards in more future steps. Thus the new TD target is:

(3) **Multiple Distributed Parallel Actors**: D4PG utilizes independent actors, gathering experience in parallel and feeding data into the same replay buffer.

(4) **Prioritized Experience Replay ([PER](https://arxiv.org/abs/1511.05952))**: The last piece of modification is to do sampling from the replay buffer of size with an non-uniform probability . In this way, a sample has the probability to be selected and thus the importance weight is .

![](https://lilianweng.github.io/posts/D4PG_algo.png)

D4PG algorithm (Image source: [Barth-Maron, et al. 2018](https://openreview.net/forum?id=SyZipzbCb)); Note that in the original paper, the variable letters are chosen slightly differently from what in the post; i.e. I use for representing a deterministic policy instead of .

## MADDPG

\[[paper](https://arxiv.org/pdf/1706.02275.pdf)|[code](https://github.com/openai/maddpg)\]

**Multi-agent DDPG** (**MADDPG**) ([Lowe et al., 2017](https://arxiv.org/pdf/1706.02275.pdf)) extends DDPG to an environment where multiple agents are coordinating to complete tasks with only local information. In the viewpoint of one agent, the environment is non-stationary as policies of other agents are quickly upgraded and remain unknown. MADDPG is an actor-critic model redesigned particularly for handling such a changing environment and interactions between agents.

The problem can be formalized in the multi-agent version of MDP, also known as _Markov games_. MADDPG is proposed for partially observable Markov games. Say, there are N agents in total with a set of states . Each agent owns a set of possible action, , and a set of observation, . The state transition function involves all states, action and observation spaces . Each agent’s stochastic policy only involves its own state and action: , a probability distribution over actions given its own observation, or a deterministic policy: .

Let , and the policies are parameterized by .

The critic in MADDPG learns a centralized action-value function for the i-th agent, where are actions of all agents. Each is learned separately for and therefore multiple agents can have arbitrary reward structures, including conflicting rewards in a competitive setting. Meanwhile, multiple actors, one for each agent, are exploring and upgrading the policy parameters on their own.

**Actor update**:

Where is the memory buffer for experience replay, containing multiple episode samples — given current observation , agents take action and get rewards , leading to the new observation .

**Critic update**:

where are the target policies with delayed softly-updated parameters.

If the policies are unknown during the critic update, we can ask each agent to learn and evolve its own approximation of others’ policies. Using the approximated policies, MADDPG still can learn efficiently although the inferred policies might not be accurate.

To mitigate the high variance triggered by the interaction between competing or collaborating agents in the environment, MADDPG proposed one more element - _policy ensembles_:

1.  Train K policies for one agent;
2.  Pick a random policy for episode rollouts;
3.  Take an ensemble of these K policies to do gradient update.

In summary, MADDPG added three additional ingredients on top of DDPG to make it adapt to the multi-agent environment:

*   Centralized critic + decentralized actors;
*   Actors are able to use estimated policies of other agents for learning;
*   Policy ensembling is good for reducing variance.

![](https://lilianweng.github.io/posts/MADDPG.png)

The architecture design of MADDPG. (Image source: [Lowe et al., 2017](https://arxiv.org/pdf/1706.02275.pdf))

## TRPO

\[[paper](https://arxiv.org/pdf/1502.05477.pdf)|[code](https://github.com/openai/baselines/tree/master/baselines/trpo_mpi)\]

To improve training stability, we should avoid parameter updates that change the policy too much at one step. **Trust region policy optimization (TRPO)** ([Schulman, et al., 2015](https://arxiv.org/pdf/1502.05477.pdf)) carries out this idea by enforcing a [KL divergence](https://lilianweng.github.io/posts/2017-08-20-gan/#kullbackleibler-and-jensenshannon-divergence) constraint on the size of policy update at each iteration.

Consider the case when we are doing off-policy RL, the policy used for collecting trajectories on rollout workers is different from the policy to optimize for. The objective function in an off-policy model measures the total advantage over the state visitation distribution and actions, while the mismatch between the training data distribution and the true policy state distribution is compensated by importance sampling estimator:

where is the policy parameters before the update and thus known to us; is defined in the same way as [above](#dpg); is the behavior policy for collecting trajectories. Noted that we use an estimated advantage rather than the true advantage function because the true rewards are usually unknown.

When training on policy, theoretically the policy for collecting data is same as the policy that we want to optimize. However, when rollout workers and optimizers are running in parallel asynchronously, the behavior policy can get stale. TRPO considers this subtle difference: It labels the behavior policy as and thus the objective function becomes:

TRPO aims to maximize the objective function subject to, _trust region constraint_ which enforces the distance between old and new policies measured by [KL-divergence](https://en.wikipedia.org/wiki/Kullback%E2%80%93Leibler_divergence) to be small enough, within a parameter δ:

In this way, the old and new policies would not diverge too much when this hard constraint is met. While still, TRPO can guarantee a monotonic improvement over policy iteration (Neat, right?). Please read the proof in the [paper](https://arxiv.org/pdf/1502.05477.pdf) if interested :)

## PPO

\[[paper](https://arxiv.org/pdf/1707.06347.pdf)|[code](https://github.com/openai/baselines/tree/master/baselines/ppo1)\]

Given that TRPO is relatively complicated and we still want to implement a similar constraint, **proximal policy optimization (PPO)** simplifies it by using a clipped surrogate objective while retaining similar performance.

First, let’s denote the probability ratio between old and new policies as:

Then, the objective function of TRPO (on policy) becomes:

Without a limitation on the distance between and , to maximize would lead to instability with extremely large parameter updates and big policy ratios. PPO imposes the constraint by forcing to stay within a small interval around 1, precisely , where is a hyperparameter.

The function clips the ratio to be no more than and no less than . The objective function of PPO takes the minimum one between the original value and the clipped version and therefore we lose the motivation for increasing the policy update to extremes for better rewards.

When applying PPO on the network architecture with shared parameters for both policy (actor) and value (critic) functions, in addition to the clipped reward, the objective function is augmented with an error term on the value estimation (formula in red) and an entropy term (formula in blue) to encourage sufficient exploration.

where Both and are two hyperparameter constants.

PPO has been tested on a set of benchmark tasks and proved to produce awesome results with much greater simplicity.

In a later paper by [Hsu et al., 2020](https://arxiv.org/abs/2009.10897), two common design choices in PPO are revisited, precisely (1) clipped probability ratio for policy regularization and (2) parameterize policy action space by continuous Gaussian or discrete softmax distribution. They first identified three failure modes in PPO and proposed replacements for these two designs.

The failure modes are:

1.  On continuous action spaces, standard PPO is unstable when rewards vanish outside bounded support.
2.  On discrete action spaces with sparse high rewards, standard PPO often gets stuck at suboptimal actions.
3.  The policy is sensitive to initialization when there are locally optimal actions close to initialization.

Discretizing the action space or use Beta distribution helps avoid failure mode 1&3 associated with Gaussian policy. Using KL regularization (same motivation as in [TRPO](#trpo)) as an alternative surrogate model helps resolve failure mode 1&2.

![](https://lilianweng.github.io/posts/ppo-loss-functions.png)

## PPG

\[[paper](https://arxiv.org/abs/2009.04416)|[code](https://github.com/openai/phasic-policy-gradient)\]

Sharing parameters between policy and value networks have pros and cons. It allows policy and value functions to share the learned features with each other, but it may cause conflicts between competing objectives and demands the same data for training two networks at the same time. **Phasic policy gradient** (**PPG**; [Cobbe, et al 2020](https://arxiv.org/abs/2009.04416)) modifies the traditional on-policy [actor-critic](#actor-critic) policy gradient algorithm. precisely [PPO](#ppo), to have separate training phases for policy and value functions. In two alternating phases:

1.  The _policy phase_: updates the policy network by optimizing the PPO [objective](#ppo_loss) ;
2.  The _auxiliary phase_: optimizes an auxiliary objective alongside a behavioral cloning loss. In the paper, value function error is the sole auxiliary objective, but it can be quite general and includes any other additional auxiliary losses.

where is a hyperparameter for controlling how much we would like to keep the policy not diverge too much from its original behavior while optimizing the auxiliary objectives.

![](https://lilianweng.github.io/posts/PPG_algo.png)

The algorithm of PPG. (Image source: [Cobbe, et al 2020](https://arxiv.org/abs/2009.04416))

where

*   is the number of policy update iterations in the policy phase. Note that the policy phase performs multiple iterations of updates per single auxiliary phase.
*   and control the sample reuse (i.e. the number of training epochs performed across data in the reply buffer) for the policy and value functions, respectively. Note that this happens within the policy phase and thus affects the learning of true value function not the auxiliary value function.
*   defines the sample reuse in the auxiliary phrase. In PPG, value function optimization can tolerate a much higher level sample reuse; for example, in the experiments of the paper, while .

PPG leads to a significant improvement on sample efficiency compared to PPO.

![](https://lilianweng.github.io/posts/PPG_exp.png)

The mean normalized performance of PPG vs PPO on the [Procgen](https://arxiv.org/abs/1912.01588) benchmark. (Image source: [Cobbe, et al 2020](https://arxiv.org/abs/2009.04416))

## ACER

\[[paper](https://arxiv.org/pdf/1611.01224.pdf)|[code](https://github.com/openai/baselines/tree/master/baselines/acer)\]

**ACER**, short for **actor-critic with experience replay** ([Wang, et al., 2017](https://arxiv.org/pdf/1611.01224.pdf)), is an off-policy actor-critic model with experience replay, greatly increasing the sample efficiency and decreasing the data correlation. A3C builds up the foundation for ACER, but it is on policy; ACER is A3C’s off-policy counterpart. The major obstacle to making A3C off policy is how to control the stability of the off-policy estimator. ACER proposes three designs to overcome it:

*   Use Retrace Q-value estimation;
*   Truncate the importance weights with bias correction;
*   Apply efficient TRPO.

**Retrace Q-value Estimation**

[_Retrace_](http://papers.nips.cc/paper/6538-safe-and-efficient-off-policy-reinforcement-learning.pdf) is an off-policy return-based Q-value estimation algorithm with a nice guarantee for convergence for any target and behavior policy pair , plus good data efficiency.

Recall how TD learning works for prediction:

1.  Compute TD error: ; the term is known as “TD target”. The expectation is used because for the future step the best estimation we can make is what the return would be if we follow the current policy .
2.  Update the value by correcting the error to move toward the goal: . In other words, the incremental update on Q is proportional to the TD error: .

When the rollout is off policy, we need to apply importance sampling on the Q update:

The product of importance weights looks pretty scary when we start imagining how it can cause super high variance and even explode. Retrace Q-value estimation method modifies to have importance weights truncated by no more than a constant :

ACER uses as the target to train the critic by minimizing the L2 error term: .

**Importance weights truncation**

To reduce the high variance of the policy gradient , ACER truncates the importance weights by a constant c, plus a correction term. The label is the ACER policy gradient at time t.

where and are value functions predicted by the critic with parameter w. The first term (blue) contains the clipped important weight. The clipping helps reduce the variance, in addition to subtracting state value function as a baseline. The second term (red) makes a correction to achieve unbiased estimation.

**Efficient TRPO**

Furthermore, ACER adopts the idea of TRPO but with a small adjustment to make it more computationally efficient: rather than measuring the KL divergence between policies before and after one update, ACER maintains a running average of past policies and forces the updated policy to not deviate far from this average.

The ACER [paper](https://arxiv.org/pdf/1611.01224.pdf) is pretty dense with many equations. Hopefully, with the prior knowledge on TD learning, Q-learning, importance sampling and TRPO, you will find the [paper](https://arxiv.org/pdf/1611.01224.pdf) slightly easier to follow :)

## ACTKR

\[[paper](https://arxiv.org/pdf/1708.05144.pdf)|[code](https://github.com/openai/baselines/tree/master/baselines/acktr)\]

**ACKTR (actor-critic using Kronecker-factored trust region)** ([Yuhuai Wu, et al., 2017](https://arxiv.org/pdf/1708.05144.pdf)) proposed to use Kronecker-factored approximation curvature ([K-FAC](https://arxiv.org/pdf/1503.05671.pdf)) to do the gradient update for both the critic and actor. K-FAC made an improvement on the computation of _natural gradient_, which is quite different from our _standard gradient_. [Here](http://kvfrans.com/a-intuitive-explanation-of-natural-gradient-descent/) is a nice, intuitive explanation of natural gradient. One sentence summary is probably:

> “we first consider all combinations of parameters that result in a new network a constant KL divergence away from the old network. This constant value can be viewed as the step size or learning rate. Out of all these possible combinations, we choose the one that minimizes our loss function.”

I listed ACTKR here mainly for the completeness of this post, but I would not dive into details, as it involves a lot of theoretical knowledge on natural gradient and optimization methods. If interested, check these papers/posts, before reading the ACKTR paper:

*   Amari. [Natural Gradient Works Efficiently in Learning](http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.452.7280&rep=rep1&type=pdf). 1998
*   Kakade. [A Natural Policy Gradient](https://papers.nips.cc/paper/2073-a-natural-policy-gradient.pdf). 2002
*   [A intuitive explanation of natural gradient descent](http://kvfrans.com/a-intuitive-explanation-of-natural-gradient-descent/)
*   [Wiki: Kronecker product](https://en.wikipedia.org/wiki/Kronecker_product)
*   Martens & Grosse. [Optimizing neural networks with kronecker-factored approximate curvature.](http://proceedings.mlr.press/v37/martens15.pdf) 2015.

Here is a high level summary from the K-FAC [paper](https://arxiv.org/pdf/1503.05671.pdf):

> “This approximation is built in two stages. In the first, the rows and columns of the Fisher are divided into groups, each of which corresponds to all the weights in a given layer, and this gives rise to a block-partitioning of the matrix. These blocks are then approximated as Kronecker products between much smaller matrices, which we show is equivalent to making certain approximating assumptions regarding the statistics of the network’s gradients.

> In the second stage, this matrix is further approximated as having an inverse which is either block-diagonal or block-tridiagonal. We justify this approximation through a careful examination of the relationships between inverse covariances, tree-structured graphical models, and linear regression. Notably, this justification doesn’t apply to the Fisher itself, and our experiments confirm that while the inverse Fisher does indeed possess this structure (approximately), the Fisher itself does not.”

## SAC

\[[paper](https://arxiv.org/abs/1801.01290)|[code](https://github.com/haarnoja/sac)\]

**Soft Actor-Critic (SAC)** ([Haarnoja et al. 2018](https://arxiv.org/abs/1801.01290)) incorporates the entropy measure of the policy into the reward to encourage exploration: we expect to learn a policy that acts as randomly as possible while it is still able to succeed at the task. It is an off-policy actor-critic model following the maximum entropy reinforcement learning framework. A precedent work is [Soft Q-learning](https://arxiv.org/abs/1702.08165).

Three key components in SAC:

*   An [actor-critic](#actor-critic) architecture with separate policy and value function networks;
*   An [off-policy](#off-policy-policy-gradient) formulation that enables reuse of previously collected data for efficiency;
*   Entropy maximization to enable stability and exploration.

The policy is trained with the objective to maximize the expected return and the entropy at the same time:

where is the entropy measure and controls how important the entropy term is, known as _temperature_ parameter. The entropy maximization leads to policies that can (1) explore more and (2) capture multiple modes of near-optimal strategies (i.e., if there exist multiple options that seem to be equally good, the policy should assign each with an equal probability to be chosen).

Precisely, SAC aims to learn three functions:

*   The policy with parameter , .
*   Soft Q-value function parameterized by , .
*   Soft state value function parameterized by , ; theoretically we can infer by knowing and , but in practice, it helps stabilize the training.

Soft Q-value and soft state value are defined as:

and denote the state and the state-action marginals of the state distribution induced by the policy ; see the similar definitions in [DPG](#dpg) section.

The soft state value function is trained to minimize the mean squared error:

where is the replay buffer.

The soft Q function is trained to minimize the soft Bellman residual:

where is the target value function which is the exponential moving average (or only gets updated periodically in a “hard” way), just like how the parameter of the target Q network is treated in [DQN](https://lilianweng.github.io/posts/2018-02-19-rl-overview/#deep-q-network) to stabilize the training.

SAC updates the policy to minimize the [KL-divergence](https://en.wikipedia.org/wiki/Kullback%E2%80%93Leibler_divergence):

where is the set of potential policies that we can model our policy as to keep them tractable; for example, can be the family of Gaussian mixture distributions, expensive to model but highly expressive and still tractable. is the partition function to normalize the distribution. It is usually intractable but does not contribute to the gradient. How to minimize depends our choice of .

This update guarantees that , please check the proof on this lemma in the Appendix B.2 in the original [paper](https://arxiv.org/abs/1801.01290).

Once we have defined the objective functions and gradients for soft action-state value, soft state value and the policy network, the soft actor-critic algorithm is straightforward:

![](https://lilianweng.github.io/posts/SAC_algo.png)

The soft actor-critic algorithm. (Image source: [original paper](https://arxiv.org/abs/1801.01290))

## SAC with Automatically Adjusted Temperature

\[[paper](https://arxiv.org/abs/1812.05905)|[code](https://github.com/rail-berkeley/softlearning)\]

SAC is brittle with respect to the temperature parameter. Unfortunately it is difficult to adjust temperature, because the entropy can vary unpredictably both across tasks and during training as the policy becomes better. An improvement on SAC formulates a constrained optimization problem: while maximizing the expected return, the policy should satisfy a minimum entropy constraint:

where is a predefined minimum policy entropy threshold.

The expected return can be decomposed into a sum of rewards at all the time steps. Because the policy at time t has no effect on the policy at the earlier time step, , we can maximize the return at different steps backward in time — this is essentially **DP**.

where we consider .

So we start the optimization from the last timestep :

First, let us define the following functions:

And the optimization becomes:

To solve the maximization optimization with inequality constraint, we can construct a [Lagrangian expression](https://cs.stanford.edu/people/davidknowles/lagrangian_duality.pdf) with a Lagrange multiplier (also known as “dual variable”), :

Considering the case when we try to _minimize with respect to_ \- given a particular value ,

*   If the constraint is satisfied, , at best we can set since we have no control over the value of . Thus, .
*   If the constraint is invalidated, , we can achieve by taking . Thus, .

In either case, we can recover the following equation,

At the same time, we want to maximize ,

Therefore, to maximize , the dual problem is listed as below. Note that to make sure is properly maximized and would not become , the constraint has to be satisfied.

We could compute the optimal and iteratively. First given the current , get the best policy that maximizes . Then plug in and compute that minimizes . Assuming we have one neural network for policy and one network for temperature parameter, the iterative update process is more aligned with how we update network parameters during training.

Now let’s go back to the soft Q value function:

Therefore the expected return is as follows, when we take one step further back to the time step :

Similar to the previous step,

The equation for updating in green has the same format as the equation for updating in blue above. By repeating this process, we can learn the optimal temperature parameter in every step by minimizing the same objective function:

The final algorithm is same as SAC except for learning explicitly with respect to the objective (see Fig. 7):

![](https://lilianweng.github.io/posts/SAC2_algo.png)

The soft actor-critic algorithm with automatically adjusted temperature. (Image source: [original paper](https://arxiv.org/abs/1812.05905))

## TD3

\[[paper](https://arxiv.org/abs/1802.09477)|[code](https://github.com/sfujim/TD3)\]

The Q-learning algorithm is commonly known to suffer from the overestimation of the value function. This overestimation can propagate through the training iterations and negatively affect the policy. This property directly motivated [Double Q-learning](https://papers.nips.cc/paper/3964-double-q-learning) and [Double DQN](https://arxiv.org/abs/1509.06461): the action selection and Q-value update are decoupled by using two value networks.

**Twin Delayed Deep Deterministic** (short for **TD3**; [Fujimoto et al., 2018](https://arxiv.org/abs/1802.09477)) applied a couple of tricks on [DDPG](#ddpg) to prevent the overestimation of the value function:

(1) **Clipped Double Q-learning**: In Double Q-Learning, the action selection and Q-value estimation are made by two networks separately. In the DDPG setting, given two deterministic actors with two corresponding critics , the Double Q-learning Bellman targets look like:

However, due to the slow changing policy, these two networks could be too similar to make independent decisions. The _Clipped Double Q-learning_ instead uses the minimum estimation among two so as to favor underestimation bias which is hard to propagate through training:

(2) **Delayed update of Target and Policy Networks**: In the [actor-critic](https://lilianweng.github.io/posts/2018-02-19-rl-overview/#actor-critic) model, policy and value updates are deeply coupled: Value estimates diverge through overestimation when the policy is poor, and the policy will become poor if the value estimate itself is inaccurate.

To reduce the variance, TD3 updates the policy at a lower frequency than the Q-function. The policy network stays the same until the value error is small enough after several updates. The idea is similar to how the periodically-updated target network stay as a stable objective in [DQN](https://lilianweng.github.io/posts/2018-02-19-rl-overview/#dqn).

(3) **Target Policy Smoothing**: Given a concern with deterministic policies that they can overfit to narrow peaks in the value function, TD3 introduced a smoothing regularization strategy on the value function: adding a small amount of clipped random noises to the selected action and averaging over mini-batches.

This approach mimics the idea of [SARSA](https://lilianweng.github.io/posts/2018-02-19-rl-overview/#sarsa-on-policy-td-control) update and enforces that similar actions should have similar values.

Here is the final algorithm:

![](https://lilianweng.github.io/posts/TD3.png)

TD3 Algorithm. (Image source: [Fujimoto et al., 2018](https://arxiv.org/abs/1802.09477))

## SVPG

\[[paper](https://arxiv.org/abs/1704.02399)|[code](https://github.com/dilinwang820/Stein-Variational-Gradient-Descent) for SVPG\]

Stein Variational Policy Gradient (**SVPG**; [Liu et al, 2017](https://arxiv.org/abs/1704.02399)) applies the [Stein](https://www.cs.dartmouth.edu/~qliu/stein.html) variational gradient descent (**SVGD**; [Liu and Wang, 2016](https://arxiv.org/abs/1608.04471)) algorithm to update the policy parameter .

In the setup of maximum entropy policy optimization, is considered as a random variable and the model is expected to learn this distribution . Assuming we know a prior on how might look like, , and we would like to guide the learning process to not make too far away from by optimizing the following objective function:

where is the expected reward when and is the KL divergence.

If we don’t have any prior information, we might set as a uniform distribution and set to a constant. Then the above objective function becomes [SAC](#SAC), where the entropy term encourages exploration:

Let’s take the derivative of w.r.t. :

The optimal distribution is:

The temperature decides a tradeoff between exploitation and exploration. When , is updated only according to the expected return . When , always follows the prior belief.

When using the SVGD method to estimate the target posterior distribution , it relies on a set of particle (independently trained policy agents) and each is updated:

where is a learning rate and is the unit ball of a [RKHS](http://mlss.tuebingen.mpg.de/2015/slides/gretton/part_1.pdf) (reproducing kernel Hilbert space) of -shaped value vectors that maximally decreases the KL divergence between the particles and the target distribution. is the distribution of .

Comparing different gradient-based update methods:

Method

Update space

Plain gradient

Δθ on the parameter space

[Natural gradient](https://lilianweng.github.io/posts/2019-09-05-evolution-strategies/#natural-gradients)

Δθ on the search distribution space

SVGD

Δθ on the kernel function space (edited)

One [estimation](https://arxiv.org/abs/1608.04471) of has the following form. A positive definite kernel , i.e. a Gaussian [radial basis function](https://en.wikipedia.org/wiki/Radial_basis_function), measures the similarity between particles.

*   The first term in red encourages learning towards the high probability regions of that is shared across similar particles. => to be similar to other particles
*   The second term in green pushes particles away from each other and therefore diversifies the policy. => to be dissimilar to other particles

![](https://lilianweng.github.io/posts/SVPG.png)

Usually the temperature follows an annealing scheme so that the training process does more exploration at the beginning but more exploitation at a later stage.

## IMPALA

\[[paper](https://arxiv.org/abs/1802.01561)|[code](https://github.com/deepmind/scalable_agent)\]

In order to scale up RL training to achieve a very high throughput, **IMPALA** (“Importance Weighted Actor-Learner Architecture”) framework decouples acting from learning on top of basic actor-critic setup and learns from all experience trajectories with **V-trace** off-policy correction.

Multiple actors generate experience in parallel, while the learner optimizes both policy and value function parameters using all the generated experience. Actors update their parameters with the latest policy from the learner periodically. Because acting and learning are decoupled, we can add many more actor machines to generate a lot more trajectories per time unit. As the training policy and the behavior policy are not totally synchronized, there is a _gap_ between them and thus we need off-policy corrections.

![](https://lilianweng.github.io/posts/IMPALA.png)

Let the value function parameterized by and the policy parameterized by . Also we know the trajectories in the replay buffer are collected by a slightly older policy .

At the training time , given , the value function parameter is learned through an L2 loss between the current value and a V-trace value target. The -step V-trace target is defined as:

where the red part is a temporal difference for . and are _truncated [importance sampling (IS)](#off-policy-policy-gradient) weights_. The product of measures how much a temporal difference observed at time impacts the update of the value function at a previous time . In the on-policy case, we have and (assuming ) and therefore the V-trace target becomes on-policy -step Bellman target.

and are two truncation constants with . impacts the fixed-point of the value function we converge to and impacts the speed of convergence. When (untruncated), we converge to the value function of the target policy ; when is close to 0, we evaluate the value function of the behavior policy ; when in-between, we evaluate a policy between and .

The value function parameter is therefore updated in the direction of:

The policy parameter is updated through policy gradient,

where is the estimated Q value, from which a state-dependent baseline is subtracted. is an entropy bonus to encourage exploration.

In the experiments, IMPALA is used to train one agent over multiple tasks. Two different model architectures are involved, a shallow model (left) and a deep residual model (right).

![](https://lilianweng.github.io/posts/IMPALA-arch.png)

## Quick Summary

After reading through all the algorithms above, I list a few building blocks or principles that seem to be common among them:

*   Try to reduce the variance and keep the bias unchanged to stabilize learning.
*   Off-policy gives us better exploration and helps us use data samples more efficiently.
*   Experience replay (training data sampled from a replay memory buffer);
*   Target network that is either frozen periodically or updated slower than the actively learned policy network;
*   Batch normalization;
*   Entropy-regularized reward;
*   The critic and actor can share lower layer parameters of the network and two output heads for policy and value functions.
*   It is possible to learn with deterministic policy rather than stochastic one.
*   Put constraint on the divergence between policy updates.
*   New optimization methods (such as K-FAC).
*   Entropy maximization of the policy helps encourage exploration.
*   Try not to overestimate the value function.
*   Think twice whether the policy and value network should share parameters.
*   TBA more.

* * *

Cited as:

```
@article{weng2018PG,
  title   = "Policy Gradient Algorithms",
  author  = "Weng, Lilian",
  journal = "lilianweng.github.io",
  year    = "2018",
  url     = "https://lilianweng.github.io/posts/2018-04-08-policy-gradient/"
}
```

## References

\[1\] jeremykun.com [Markov Chain Monte Carlo Without all the Bullshit](https://jeremykun.com/2015/04/06/markov-chain-monte-carlo-without-all-the-bullshit/)

\[2\] Richard S. Sutton and Andrew G. Barto. [Reinforcement Learning: An Introduction; 2nd Edition](http://incompleteideas.net/book/bookdraft2017nov5.pdf). 2017.

\[3\] John Schulman, et al. [“High-dimensional continuous control using generalized advantage estimation.”](https://arxiv.org/pdf/1506.02438.pdf) ICLR 2016.

\[4\] Thomas Degris, Martha White, and Richard S. Sutton. [“Off-policy actor-critic.”](https://arxiv.org/pdf/1205.4839.pdf) ICML 2012.

\[5\] timvieira.github.io [Importance sampling](http://timvieira.github.io/blog/post/2014/12/21/importance-sampling/)

\[6\] Mnih, Volodymyr, et al. [“Asynchronous methods for deep reinforcement learning.”](https://arxiv.org/abs/1602.01783) ICML. 2016.

\[7\] David Silver, et al. [“Deterministic policy gradient algorithms.”](https://hal.inria.fr/file/index/docid/938992/filename/dpg-icml2014.pdf) ICML. 2014.

\[8\] Timothy P. Lillicrap, et al. [“Continuous control with deep reinforcement learning.”](https://arxiv.org/pdf/1509.02971.pdf) arXiv preprint arXiv:1509.02971 (2015).

\[9\] Ryan Lowe, et al. [“Multi-agent actor-critic for mixed cooperative-competitive environments.”](https://arxiv.org/pdf/1706.02275.pdf) NIPS. 2017.

\[10\] John Schulman, et al. [“Trust region policy optimization.”](https://arxiv.org/pdf/1502.05477.pdf) ICML. 2015.

\[11\] Ziyu Wang, et al. [“Sample efficient actor-critic with experience replay.”](https://arxiv.org/pdf/1611.01224.pdf) ICLR 2017.

\[12\] Rémi Munos, Tom Stepleton, Anna Harutyunyan, and Marc Bellemare. [“Safe and efficient off-policy reinforcement learning”](http://papers.nips.cc/paper/6538-safe-and-efficient-off-policy-reinforcement-learning.pdf) NIPS. 2016.

\[13\] Yuhuai Wu, et al. [“Scalable trust-region method for deep reinforcement learning using Kronecker-factored approximation.”](https://arxiv.org/pdf/1708.05144.pdf) NIPS. 2017.

\[14\] kvfrans.com [A intuitive explanation of natural gradient descent](http://kvfrans.com/a-intuitive-explanation-of-natural-gradient-descent/)

\[15\] Sham Kakade. [“A Natural Policy Gradient.”](https://papers.nips.cc/paper/2073-a-natural-policy-gradient.pdf). NIPS. 2002.

\[16\] [“Going Deeper Into Reinforcement Learning: Fundamentals of Policy Gradients.”](https://danieltakeshi.github.io/2017/03/28/going-deeper-into-reinforcement-learning-fundamentals-of-policy-gradients/) - Seita’s Place, Mar 2017.

\[17\] [“Notes on the Generalized Advantage Estimation Paper.”](https://danieltakeshi.github.io/2017/04/02/notes-on-the-generalized-advantage-estimation-paper/) - Seita’s Place, Apr, 2017.

\[18\] Gabriel Barth-Maron, et al. [“Distributed Distributional Deterministic Policy Gradients.”](https://arxiv.org/pdf/1804.08617.pdf) ICLR 2018 poster.

\[19\] Tuomas Haarnoja, Aurick Zhou, Pieter Abbeel, and Sergey Levine. [“Soft Actor-Critic: Off-Policy Maximum Entropy Deep Reinforcement Learning with a Stochastic Actor.”](https://arxiv.org/pdf/1801.01290.pdf) arXiv preprint arXiv:1801.01290 (2018).

\[20\] Scott Fujimoto, Herke van Hoof, and Dave Meger. [“Addressing Function Approximation Error in Actor-Critic Methods.”](https://arxiv.org/abs/1802.09477) arXiv preprint arXiv:1802.09477 (2018).

\[21\] Tuomas Haarnoja, et al. [“Soft Actor-Critic Algorithms and Applications.”](https://arxiv.org/abs/1812.05905) arXiv preprint arXiv:1812.05905 (2018).

\[22\] David Knowles. [“Lagrangian Duality for Dummies”](https://cs.stanford.edu/people/davidknowles/lagrangian_duality.pdf) Nov 13, 2010.

\[23\] Yang Liu, et al. [“Stein variational policy gradient.”](https://arxiv.org/abs/1704.02399) arXiv preprint arXiv:1704.02399 (2017).

\[24\] Qiang Liu and Dilin Wang. [“Stein variational gradient descent: A general purpose bayesian inference algorithm.”](https://papers.nips.cc/paper/6338-stein-variational-gradient-descent-a-general-purpose-bayesian-inference-algorithm.pdf) NIPS. 2016.

\[25\] Lasse Espeholt, et al. [“IMPALA: Scalable Distributed Deep-RL with Importance Weighted Actor-Learner Architectures”](https://arxiv.org/abs/1802.01561) arXiv preprint 1802.01561 (2018).

\[26\] Karl Cobbe, et al. [“Phasic Policy Gradient.”](https://arxiv.org/abs/2009.04416) arXiv preprint arXiv:2009.04416 (2020).

\[27\] Chloe Ching-Yun Hsu, et al. [“Revisiting Design Choices in Proximal Policy Optimization.”](https://arxiv.org/abs/2009.10897) arXiv preprint arXiv:2009.10897 (2020).