Lil'Log
|
Posts
Archive
Search
Tags
FAQ
Policy Gradient Algorithms
Date: April 8, 2018 | Estimated Reading Time: 52 min | Author: Lilian Weng
Table of Contents

[Updated on 2018-06-30: add two new policy gradient methods, SAC and D4PG.]
[Updated on 2018-09-30: add a new policy gradient method, TD3.]
[Updated on 2019-02-09: add SAC with automatically adjusted temperature].
[Updated on 2019-06-26: Thanks to Chanseok, we have a version of this post in Korean].
[Updated on 2019-09-12: add a new policy gradient method SVPG.]
[Updated on 2019-12-22: add a new policy gradient method IMPALA.]
[Updated on 2020-10-15: add a new policy gradient method PPG & some new discussion in PPO.]
[Updated on 2021-09-19: Thanks to Wenhao & 爱吃猫的鱼, we have this post in Chinese1 & Chinese2].

What is Policy Gradient

Policy gradient is an approach to solve reinforcement learning problems. If you haven’t looked into the field of reinforcement learning, please first read the section “A (Long) Peek into Reinforcement Learning » Key Concepts” for the problem definition and key concepts.

Notations

Here is a list of notations to help you read through equations in the post easily.

Symbol	Meaning

𝑠
∈
𝑆
	States.

𝑎
∈
𝐴
	Actions.

𝑟
∈
𝑅
	Rewards.

𝑆
𝑡
,
𝐴
𝑡
,
𝑅
𝑡
	State, action, and reward at time step 
𝑡
 of one trajectory. I may occasionally use 
𝑠
𝑡
,
𝑎
𝑡
,
𝑟
𝑡
 as well.

𝛾
	Discount factor; penalty to uncertainty of future rewards; 
0
<
𝛾
≤
1
.

𝐺
𝑡
	Return; or discounted future reward; 
𝐺
𝑡
=
∑
𝑘
=
0
∞
𝛾
𝑘
𝑅
𝑡
+
𝑘
+
1
.

𝑃
(
𝑠
′
,
𝑟
|
𝑠
,
𝑎
)
	Transition probability of getting to the next state 
𝑠
′
 from the current state 
𝑠
 with action 
𝑎
 and reward 
𝑟
.

𝜋
(
𝑎
|
𝑠
)
	Stochastic policy (agent behavior strategy); 
𝜋
𝜃
(
.
)
 is a policy parameterized by 
𝜃
.

𝜇
(
𝑠
)
	Deterministic policy; we can also label this as 
𝜋
(
𝑠
)
, but using a different letter gives better distinction so that we can easily tell when the policy is stochastic or deterministic without further explanation. Either 
𝜋
 or 
𝜇
 is what a reinforcement learning algorithm aims to learn.

𝑉
(
𝑠
)
	State-value function measures the expected return of state 
𝑠
; 
𝑉
𝑤
(
.
)
 is a value function parameterized by 
𝑤
.

𝑉
𝜋
(
𝑠
)
	The value of state 
𝑠
 when we follow a policy 
𝜋
; 
𝑉
𝜋
(
𝑠
)
=
𝐸
𝑎
∼
𝜋
[
𝐺
𝑡
|
𝑆
𝑡
=
𝑠
]
.

𝑄
(
𝑠
,
𝑎
)
	Action-value function is similar to 
𝑉
(
𝑠
)
, but it assesses the expected return of a pair of state and action 
(
𝑠
,
𝑎
)
; 
𝑄
𝑤
(
.
)
 is a action value function parameterized by 
𝑤
.

𝑄
𝜋
(
𝑠
,
𝑎
)
	Similar to 
𝑉
𝜋
(
.
)
, the value of (state, action) pair when we follow a policy 
𝜋
; 
𝑄
𝜋
(
𝑠
,
𝑎
)
=
𝐸
𝑎
∼
𝜋
[
𝐺
𝑡
|
𝑆
𝑡
=
𝑠
,
𝐴
𝑡
=
𝑎
]
.

𝐴
(
𝑠
,
𝑎
)
	Advantage function, 
𝐴
(
𝑠
,
𝑎
)
=
𝑄
(
𝑠
,
𝑎
)
−
𝑉
(
𝑠
)
; it can be considered as another version of Q-value with lower variance by taking the state-value off as the baseline.
Policy Gradient

The goal of reinforcement learning is to find an optimal behavior strategy for the agent to obtain optimal rewards. The policy gradient methods target at modeling and optimizing the policy directly. The policy is usually modeled with a parameterized function respect to 
𝜃
, 
𝜋
𝜃
(
𝑎
|
𝑠
)
. The value of the reward (objective) function depends on this policy and then various algorithms can be applied to optimize 
𝜃
 for the best reward.

The reward function is defined as:





𝐽
(
𝜃
)
=
∑
𝑠
∈
𝑆
𝑑
𝜋
(
𝑠
)
𝑉
𝜋
(
𝑠
)
=
∑
𝑠
∈
𝑆
𝑑
𝜋
(
𝑠
)
∑
𝑎
∈
𝐴
𝜋
𝜃
(
𝑎
|
𝑠
)
𝑄
𝜋
(
𝑠
,
𝑎
)

where 
𝑑
𝜋
(
𝑠
)
 is the stationary distribution of Markov chain for 
𝜋
𝜃
 (on-policy state distribution under 
𝜋
). For simplicity, the parameter 
𝜃
 would be omitted for the policy 
𝜋
𝜃
 when the policy is present in the subscript of other functions; for example, 
𝑑
𝜋
 and 
𝑄
𝜋
 should be 
𝑑
𝜋
𝜃
 and 
𝑄
𝜋
𝜃
 if written in full.

Imagine that you can travel along the Markov chain’s states forever, and eventually, as the time progresses, the probability of you ending up with one state becomes unchanged — this is the stationary probability for 
𝜋
𝜃
. 
𝑑
𝜋
(
𝑠
)
=
lim
𝑡
→
∞
𝑃
(
𝑠
𝑡
=
𝑠
|
𝑠
0
,
𝜋
𝜃
)
 is the probability that 
𝑠
𝑡
=
𝑠
 when starting from 
𝑠
0
 and following policy 
𝜋
𝜃
 for t steps. Actually, the existence of the stationary distribution of Markov chain is one main reason for why PageRank algorithm works. If you want to read more, check this.

It is natural to expect policy-based methods are more useful in the continuous space. Because there is an infinite number of actions and (or) states to estimate the values for and hence value-based approaches are way too expensive computationally in the continuous space. For example, in generalized policy iteration, the policy improvement step 
arg
⁡
max
𝑎
∈
𝐴
𝑄
𝜋
(
𝑠
,
𝑎
)
 requires a full scan of the action space, suffering from the curse of dimensionality.

Using gradient ascent, we can move 
𝜃
 toward the direction suggested by the gradient 
∇
𝜃
𝐽
(
𝜃
)
 to find the best 
𝜃
 for 
𝜋
𝜃
 that produces the highest return.

Policy Gradient Theorem

Computing the gradient 
∇
𝜃
𝐽
(
𝜃
)
 is tricky because it depends on both the action selection (directly determined by 
𝜋
𝜃
) and the stationary distribution of states following the target selection behavior (indirectly determined by 
𝜋
𝜃
). Given that the environment is generally unknown, it is difficult to estimate the effect on the state distribution by a policy update.

Luckily, the policy gradient theorem comes to save the world! Woohoo! It provides a nice reformation of the derivative of the objective function to not involve the derivative of the state distribution 
𝑑
𝜋
(
.
)
 and simplify the gradient computation 
∇
𝜃
𝐽
(
𝜃
)
 a lot.

	


	


∇
𝜃
𝐽
(
𝜃
)
	
=
∇
𝜃
∑
𝑠
∈
𝑆
𝑑
𝜋
(
𝑠
)
∑
𝑎
∈
𝐴
𝑄
𝜋
(
𝑠
,
𝑎
)
𝜋
𝜃
(
𝑎
|
𝑠
)

	
∝
∑
𝑠
∈
𝑆
𝑑
𝜋
(
𝑠
)
∑
𝑎
∈
𝐴
𝑄
𝜋
(
𝑠
,
𝑎
)
∇
𝜃
𝜋
𝜃
(
𝑎
|
𝑠
)
Proof of Policy Gradient Theorem

This session is pretty dense, as it is the time for us to go through the proof (Sutton & Barto, 2017; Sec. 13.1) and figure out why the policy gradient theorem is correct.

We first start with the derivative of the state value function:

		
	
	
	
	
	

	
	

	
	

	
	
∇
𝜃
𝑉
𝜋
(
𝑠
)


=
	
∇
𝜃
(
∑
𝑎
∈
𝐴
𝜋
𝜃
(
𝑎
|
𝑠
)
𝑄
𝜋
(
𝑠
,
𝑎
)
)
	

=
	
∑
𝑎
∈
𝐴
(
∇
𝜃
𝜋
𝜃
(
𝑎
|
𝑠
)
𝑄
𝜋
(
𝑠
,
𝑎
)
+
𝜋
𝜃
(
𝑎
|
𝑠
)
∇
𝜃
𝑄
𝜋
(
𝑠
,
𝑎
)
)
	
; Derivative product rule.


=
	
∑
𝑎
∈
𝐴
(
∇
𝜃
𝜋
𝜃
(
𝑎
|
𝑠
)
𝑄
𝜋
(
𝑠
,
𝑎
)
+
𝜋
𝜃
(
𝑎
|
𝑠
)
∇
𝜃
∑
𝑠
′
,
𝑟
𝑃
(
𝑠
′
,
𝑟
|
𝑠
,
𝑎
)
(
𝑟
+
𝑉
𝜋
(
𝑠
′
)
)
)
	
; Extend 
𝑄
𝜋
 with future state value.


=
	
∑
𝑎
∈
𝐴
(
∇
𝜃
𝜋
𝜃
(
𝑎
|
𝑠
)
𝑄
𝜋
(
𝑠
,
𝑎
)
+
𝜋
𝜃
(
𝑎
|
𝑠
)
∑
𝑠
′
,
𝑟
𝑃
(
𝑠
′
,
𝑟
|
𝑠
,
𝑎
)
∇
𝜃
𝑉
𝜋
(
𝑠
′
)
)
	
𝑃
(
𝑠
′
,
𝑟
|
𝑠
,
𝑎
)
 or 
𝑟
 is not a func of 
𝜃


=
	
∑
𝑎
∈
𝐴
(
∇
𝜃
𝜋
𝜃
(
𝑎
|
𝑠
)
𝑄
𝜋
(
𝑠
,
𝑎
)
+
𝜋
𝜃
(
𝑎
|
𝑠
)
∑
𝑠
′
𝑃
(
𝑠
′
|
𝑠
,
𝑎
)
∇
𝜃
𝑉
𝜋
(
𝑠
′
)
)
	
; Because 
𝑃
(
𝑠
′
|
𝑠
,
𝑎
)
=
∑
𝑟
𝑃
(
𝑠
′
,
𝑟
|
𝑠
,
𝑎
)

Now we have:




∇
𝜃
𝑉
𝜋
(
𝑠
)
=
∑
𝑎
∈
𝐴
(
∇
𝜃
𝜋
𝜃
(
𝑎
|
𝑠
)
𝑄
𝜋
(
𝑠
,
𝑎
)
+
𝜋
𝜃
(
𝑎
|
𝑠
)
∑
𝑠
′
𝑃
(
𝑠
′
|
𝑠
,
𝑎
)
∇
𝜃
𝑉
𝜋
(
𝑠
′
)
)

This equation has a nice recursive form (see the red parts!) and the future state value function 
𝑉
𝜋
(
𝑠
′
)
 can be repeated unrolled by following the same equation.

Let’s consider the following visitation sequence and label the probability of transitioning from state s to state x with policy 
𝜋
𝜃
 after k step as 
𝜌
𝜋
(
𝑠
→
𝑥
,
𝑘
)
.

	
	
	
𝑠
→
𝑎
∼
𝜋
𝜃
(
.
|
𝑠
)
𝑠
′
→
𝑎
∼
𝜋
𝜃
(
.
|
𝑠
′
)
𝑠
″
→
𝑎
∼
𝜋
𝜃
(
.
|
𝑠
″
)
…
When k = 0: 
𝜌
𝜋
(
𝑠
→
𝑠
,
𝑘
=
0
)
=
1
.
When k = 1, we scan through all possible actions and sum up the transition probabilities to the target state: 
𝜌
𝜋
(
𝑠
→
𝑠
′
,
𝑘
=
1
)
=
∑
𝑎
𝜋
𝜃
(
𝑎
|
𝑠
)
𝑃
(
𝑠
′
|
𝑠
,
𝑎
)
.
Imagine that the goal is to go from state s to x after k+1 steps while following policy 
𝜋
𝜃
. We can first travel from s to a middle point s’ (any state can be a middle point, 
𝑠
′
∈
𝑆
) after k steps and then go to the final state x during the last step. In this way, we are able to update the visitation probability recursively: 
𝜌
𝜋
(
𝑠
→
𝑥
,
𝑘
+
1
)
=
∑
𝑠
′
𝜌
𝜋
(
𝑠
→
𝑠
′
,
𝑘
)
𝜌
𝜋
(
𝑠
′
→
𝑥
,
1
)
.

Then we go back to unroll the recursive representation of 
∇
𝜃
𝑉
𝜋
(
𝑠
)
! Let 
𝜙
(
𝑠
)
=
∑
𝑎
∈
𝐴
∇
𝜃
𝜋
𝜃
(
𝑎
|
𝑠
)
𝑄
𝜋
(
𝑠
,
𝑎
)
 to simplify the maths. If we keep on extending 
∇
𝜃
𝑉
𝜋
(
.
)
 infinitely, it is easy to find out that we can transition from the starting state s to any state after any number of steps in this unrolling process and by summing up all the visitation probabilities, we get 
∇
𝜃
𝑉
𝜋
(
𝑠
)
!

	
	


	


	

	



	


	


	



	
	



	
∇
𝜃
𝑉
𝜋
(
𝑠
)


=
	
𝜙
(
𝑠
)
+
∑
𝑎
𝜋
𝜃
(
𝑎
|
𝑠
)
∑
𝑠
′
𝑃
(
𝑠
′
|
𝑠
,
𝑎
)
∇
𝜃
𝑉
𝜋
(
𝑠
′
)


=
	
𝜙
(
𝑠
)
+
∑
𝑠
′
∑
𝑎
𝜋
𝜃
(
𝑎
|
𝑠
)
𝑃
(
𝑠
′
|
𝑠
,
𝑎
)
∇
𝜃
𝑉
𝜋
(
𝑠
′
)


=
	
𝜙
(
𝑠
)
+
∑
𝑠
′
𝜌
𝜋
(
𝑠
→
𝑠
′
,
1
)
∇
𝜃
𝑉
𝜋
(
𝑠
′
)


=
	
𝜙
(
𝑠
)
+
∑
𝑠
′
𝜌
𝜋
(
𝑠
→
𝑠
′
,
1
)
∑
𝑎
∈
𝐴
(
∇
𝜃
𝜋
𝜃
(
𝑎
|
𝑠
′
)
𝑄
𝜋
(
𝑠
′
,
𝑎
)
+
𝜋
𝜃
(
𝑎
|
𝑠
′
)
∑
𝑠
′
𝑃
(
𝑠
″
|
𝑠
′
,
𝑎
)
∇
𝜃
𝑉
𝜋
(
𝑠
″
)
)


=
	
𝜙
(
𝑠
)
+
∑
𝑠
′
𝜌
𝜋
(
𝑠
→
𝑠
′
,
1
)
[
𝜙
(
𝑠
′
)
+
∑
𝑠
″
𝜌
𝜋
(
𝑠
′
→
𝑠
″
,
1
)
∇
𝜃
𝑉
𝜋
(
𝑠
″
)
]


=
	
𝜙
(
𝑠
)
+
∑
𝑠
′
𝜌
𝜋
(
𝑠
→
𝑠
′
,
1
)
𝜙
(
𝑠
′
)
+
∑
𝑠
″
𝜌
𝜋
(
𝑠
→
𝑠
″
,
2
)
∇
𝜃
𝑉
𝜋
(
𝑠
″
)
 ; Consider 
𝑠
′
 as the middle point for 
𝑠
→
𝑠
″


=
	
𝜙
(
𝑠
)
+
∑
𝑠
′
𝜌
𝜋
(
𝑠
→
𝑠
′
,
1
)
𝜙
(
𝑠
′
)
+
∑
𝑠
″
𝜌
𝜋
(
𝑠
→
𝑠
″
,
2
)
𝜙
(
𝑠
″
)
+
∑
𝑠
‴
𝜌
𝜋
(
𝑠
→
𝑠
‴
,
3
)
∇
𝜃
𝑉
𝜋
(
𝑠
‴
)


=
	
…
; Repeatedly unrolling the part of 
∇
𝜃
𝑉
𝜋
(
.
)


=
	
∑
𝑥
∈
𝑆
∑
𝑘
=
0
∞
𝜌
𝜋
(
𝑠
→
𝑥
,
𝑘
)
𝜙
(
𝑥
)

The nice rewriting above allows us to exclude the derivative of Q-value function, 
∇
𝜃
𝑄
𝜋
(
𝑠
,
𝑎
)
. By plugging it into the objective function 
𝐽
(
𝜃
)
, we are getting the following:

		
	



	

	
	
	


	
	

	
	

	
∇
𝜃
𝐽
(
𝜃
)
	
=
∇
𝜃
𝑉
𝜋
(
𝑠
0
)
	
; Starting from a random state 
𝑠
0

	
=
∑
𝑠
∑
𝑘
=
0
∞
𝜌
𝜋
(
𝑠
0
→
𝑠
,
𝑘
)
𝜙
(
𝑠
)
	
; Let 
𝜂
(
𝑠
)
=
∑
𝑘
=
0
∞
𝜌
𝜋
(
𝑠
0
→
𝑠
,
𝑘
)

	
=
∑
𝑠
𝜂
(
𝑠
)
𝜙
(
𝑠
)
	
	
=
(
∑
𝑠
𝜂
(
𝑠
)
)
∑
𝑠
𝜂
(
𝑠
)
∑
𝑠
𝜂
(
𝑠
)
𝜙
(
𝑠
)
	
; Normalize 
𝜂
(
𝑠
)
,
𝑠
∈
𝑆
 to be a probability distribution.

	
∝
∑
𝑠
𝜂
(
𝑠
)
∑
𝑠
𝜂
(
𝑠
)
𝜙
(
𝑠
)
	
∑
𝑠
𝜂
(
𝑠
)
 is a constant

	
=
∑
𝑠
𝑑
𝜋
(
𝑠
)
∑
𝑎
∇
𝜃
𝜋
𝜃
(
𝑎
|
𝑠
)
𝑄
𝜋
(
𝑠
,
𝑎
)
	
𝑑
𝜋
(
𝑠
)
=
𝜂
(
𝑠
)
∑
𝑠
𝜂
(
𝑠
)
 is stationary distribution.

In the episodic case, the constant of proportionality (
∑
𝑠
𝜂
(
𝑠
)
) is the average length of an episode; in the continuing case, it is 1 (Sutton & Barto, 2017; Sec. 13.2). The gradient can be further written as:

	

	
	


	
		
∇
𝜃
𝐽
(
𝜃
)
	
∝
∑
𝑠
∈
𝑆
𝑑
𝜋
(
𝑠
)
∑
𝑎
∈
𝐴
𝑄
𝜋
(
𝑠
,
𝑎
)
∇
𝜃
𝜋
𝜃
(
𝑎
|
𝑠
)
	
	
=
∑
𝑠
∈
𝑆
𝑑
𝜋
(
𝑠
)
∑
𝑎
∈
𝐴
𝜋
𝜃
(
𝑎
|
𝑠
)
𝑄
𝜋
(
𝑠
,
𝑎
)
∇
𝜃
𝜋
𝜃
(
𝑎
|
𝑠
)
𝜋
𝜃
(
𝑎
|
𝑠
)
	
	
=
𝐸
𝜋
[
𝑄
𝜋
(
𝑠
,
𝑎
)
∇
𝜃
ln
⁡
𝜋
𝜃
(
𝑎
|
𝑠
)
]
	
; Because 
(
ln
⁡
𝑥
)
′
=
1
/
𝑥

Where 
𝐸
𝜋
 refers to 
𝐸
𝑠
∼
𝑑
𝜋
,
𝑎
∼
𝜋
𝜃
 when both state and action distributions follow the policy 
𝜋
𝜃
 (on policy).

The policy gradient theorem lays the theoretical foundation for various policy gradient algorithms. This vanilla policy gradient update has no bias but high variance. Many following algorithms were proposed to reduce the variance while keeping the bias unchanged.

∇
𝜃
𝐽
(
𝜃
)
=
𝐸
𝜋
[
𝑄
𝜋
(
𝑠
,
𝑎
)
∇
𝜃
ln
⁡
𝜋
𝜃
(
𝑎
|
𝑠
)
]

Here is a nice summary of a general form of policy gradient methods borrowed from the GAE (general advantage estimation) paper (Schulman et al., 2016) and this post thoroughly discussed several components in GAE , highly recommended.

A general form of policy gradient methods. (Image source: Schulman et al., 2016)
Policy Gradient Algorithms

Tons of policy gradient algorithms have been proposed during recent years and there is no way for me to exhaust them. I’m introducing some of them that I happened to know and read about.

REINFORCE

REINFORCE (Monte-Carlo policy gradient) relies on an estimated return by Monte-Carlo methods using episode samples to update the policy parameter 
𝜃
. REINFORCE works because the expectation of the sample gradient is equal to the actual gradient:

		
		
∇
𝜃
𝐽
(
𝜃
)
	
=
𝐸
𝜋
[
𝑄
𝜋
(
𝑠
,
𝑎
)
∇
𝜃
ln
⁡
𝜋
𝜃
(
𝑎
|
𝑠
)
]
	
	
=
𝐸
𝜋
[
𝐺
𝑡
∇
𝜃
ln
⁡
𝜋
𝜃
(
𝐴
𝑡
|
𝑆
𝑡
)
]
	
; Because 
𝑄
𝜋
(
𝑆
𝑡
,
𝐴
𝑡
)
=
𝐸
𝜋
[
𝐺
𝑡
|
𝑆
𝑡
,
𝐴
𝑡
]

Therefore we are able to measure 
𝐺
𝑡
 from real sample trajectories and use that to update our policy gradient. It relies on a full trajectory and that’s why it is a Monte-Carlo method.

The process is pretty straightforward:

Initialize the policy parameter 
𝜃
 at random.
Generate one trajectory on policy 
𝜋
𝜃
: 
𝑆
1
,
𝐴
1
,
𝑅
2
,
𝑆
2
,
𝐴
2
,
…
,
𝑆
𝑇
.
For t=1, 2, … , T:
Estimate the the return 
𝐺
𝑡
;
Update policy parameters: 
𝜃
←
𝜃
+
𝛼
𝛾
𝑡
𝐺
𝑡
∇
𝜃
ln
⁡
𝜋
𝜃
(
𝐴
𝑡
|
𝑆
𝑡
)

A widely used variation of REINFORCE is to subtract a baseline value from the return 
𝐺
𝑡
 to reduce the variance of gradient estimation while keeping the bias unchanged (Remember we always want to do this when possible). For example, a common baseline is to subtract state-value from action-value, and if applied, we would use advantage 
𝐴
(
𝑠
,
𝑎
)
=
𝑄
(
𝑠
,
𝑎
)
−
𝑉
(
𝑠
)
 in the gradient ascent update. This post nicely explained why a baseline works for reducing the variance, in addition to a set of fundamentals of policy gradient.

Actor-Critic

Two main components in policy gradient are the policy model and the value function. It makes a lot of sense to learn the value function in addition to the policy, since knowing the value function can assist the policy update, such as by reducing gradient variance in vanilla policy gradients, and that is exactly what the Actor-Critic method does.

Actor-critic methods consist of two models, which may optionally share parameters:

Critic updates the value function parameters w and depending on the algorithm it could be action-value 
𝑄
𝑤
(
𝑎
|
𝑠
)
 or state-value 
𝑉
𝑤
(
𝑠
)
.
Actor updates the policy parameters 
𝜃
 for 
𝜋
𝜃
(
𝑎
|
𝑠
)
, in the direction suggested by the critic.

Let’s see how it works in a simple action-value actor-critic algorithm.

Initialize 
𝑠
,
𝜃
,
𝑤
 at random; sample 
𝑎
∼
𝜋
𝜃
(
𝑎
|
𝑠
)
.
For 
𝑡
=
1
…
𝑇
:
Sample reward 
𝑟
𝑡
∼
𝑅
(
𝑠
,
𝑎
)
 and next state 
𝑠
′
∼
𝑃
(
𝑠
′
|
𝑠
,
𝑎
)
;
Then sample the next action 
𝑎
′
∼
𝜋
𝜃
(
𝑎
′
|
𝑠
′
)
;
Update the policy parameters: 
𝜃
←
𝜃
+
𝛼
𝜃
𝑄
𝑤
(
𝑠
,
𝑎
)
∇
𝜃
ln
⁡
𝜋
𝜃
(
𝑎
|
𝑠
)
;
Compute the correction (TD error) for action-value at time t:

𝛿
𝑡
=
𝑟
𝑡
+
𝛾
𝑄
𝑤
(
𝑠
′
,
𝑎
′
)
−
𝑄
𝑤
(
𝑠
,
𝑎
)

and use it to update the parameters of action-value function:

𝑤
←
𝑤
+
𝛼
𝑤
𝛿
𝑡
∇
𝑤
𝑄
𝑤
(
𝑠
,
𝑎
)
Update 
𝑎
←
𝑎
′
 and 
𝑠
←
𝑠
′
.

Two learning rates, 
𝛼
𝜃
 and 
𝛼
𝑤
, are predefined for policy and value function parameter updates respectively.

Off-Policy Policy Gradient

Both REINFORCE and the vanilla version of actor-critic method are on-policy: training samples are collected according to the target policy — the very same policy that we try to optimize for. Off policy methods, however, result in several additional advantages:

The off-policy approach does not require full trajectories and can reuse any past episodes (“experience replay”) for much better sample efficiency.
The sample collection follows a behavior policy different from the target policy, bringing better exploration.

Now let’s see how off-policy policy gradient is computed. The behavior policy for collecting samples is a known policy (predefined just like a hyperparameter), labelled as 
𝛽
(
𝑎
|
𝑠
)
. The objective function sums up the reward over the state distribution defined by this behavior policy:





𝐽
(
𝜃
)
=
∑
𝑠
∈
𝑆
𝑑
𝛽
(
𝑠
)
∑
𝑎
∈
𝐴
𝑄
𝜋
(
𝑠
,
𝑎
)
𝜋
𝜃
(
𝑎
|
𝑠
)
=
𝐸
𝑠
∼
𝑑
𝛽
[
∑
𝑎
∈
𝐴
𝑄
𝜋
(
𝑠
,
𝑎
)
𝜋
𝜃
(
𝑎
|
𝑠
)
]

where 
𝑑
𝛽
(
𝑠
)
 is the stationary distribution of the behavior policy 
𝛽
; recall that 
𝑑
𝛽
(
𝑠
)
=
lim
𝑡
→
∞
𝑃
(
𝑆
𝑡
=
𝑠
|
𝑆
0
,
𝛽
)
; and 
𝑄
𝜋
 is the action-value function estimated with regard to the target policy 
𝜋
 (not the behavior policy!).

Given that the training observations are sampled by 
𝑎
∼
𝛽
(
𝑎
|
𝑠
)
, we can rewrite the gradient as:

	
	
	
	
	

	
	

	
	
	
∇
𝜃
𝐽
(
𝜃
)
	
=
∇
𝜃
𝐸
𝑠
∼
𝑑
𝛽
[
∑
𝑎
∈
𝐴
𝑄
𝜋
(
𝑠
,
𝑎
)
𝜋
𝜃
(
𝑎
|
𝑠
)
]
	
	
=
𝐸
𝑠
∼
𝑑
𝛽
[
∑
𝑎
∈
𝐴
(
𝑄
𝜋
(
𝑠
,
𝑎
)
∇
𝜃
𝜋
𝜃
(
𝑎
|
𝑠
)
+
𝜋
𝜃
(
𝑎
|
𝑠
)
∇
𝜃
𝑄
𝜋
(
𝑠
,
𝑎
)
)
]
	
; Derivative product rule.

	
≈
(
𝑖
)
𝐸
𝑠
∼
𝑑
𝛽
[
∑
𝑎
∈
𝐴
𝑄
𝜋
(
𝑠
,
𝑎
)
∇
𝜃
𝜋
𝜃
(
𝑎
|
𝑠
)
]
	
; Ignore the red part: 
𝜋
𝜃
(
𝑎
|
𝑠
)
∇
𝜃
𝑄
𝜋
(
𝑠
,
𝑎
)
.

	
=
𝐸
𝑠
∼
𝑑
𝛽
[
∑
𝑎
∈
𝐴
𝛽
(
𝑎
|
𝑠
)
𝜋
𝜃
(
𝑎
|
𝑠
)
𝛽
(
𝑎
|
𝑠
)
𝑄
𝜋
(
𝑠
,
𝑎
)
∇
𝜃
𝜋
𝜃
(
𝑎
|
𝑠
)
𝜋
𝜃
(
𝑎
|
𝑠
)
]
	
	
=
𝐸
𝛽
[
𝜋
𝜃
(
𝑎
|
𝑠
)
𝛽
(
𝑎
|
𝑠
)
𝑄
𝜋
(
𝑠
,
𝑎
)
∇
𝜃
ln
⁡
𝜋
𝜃
(
𝑎
|
𝑠
)
]
	
; The blue part is the importance weight.

where 
𝜋
𝜃
(
𝑎
|
𝑠
)
𝛽
(
𝑎
|
𝑠
)
 is the importance weight. Because 
𝑄
𝜋
 is a function of the target policy and thus a function of policy parameter 
𝜃
, we should take the derivative of 
∇
𝜃
𝑄
𝜋
(
𝑠
,
𝑎
)
 as well according to the product rule. However, it is super hard to compute 
∇
𝜃
𝑄
𝜋
(
𝑠
,
𝑎
)
 in reality. Fortunately if we use an approximated gradient with the gradient of Q ignored, we still guarantee the policy improvement and eventually achieve the true local minimum. This is justified in the proof here (Degris, White & Sutton, 2012).

In summary, when applying policy gradient in the off-policy setting, we can simple adjust it with a weighted sum and the weight is the ratio of the target policy to the behavior policy, 
𝜋
𝜃
(
𝑎
|
𝑠
)
𝛽
(
𝑎
|
𝑠
)
.

A3C

[paper|code]

Asynchronous Advantage Actor-Critic (Mnih et al., 2016), short for A3C, is a classic policy gradient method with a special focus on parallel training.

In A3C, the critics learn the value function while multiple actors are trained in parallel and get synced with global parameters from time to time. Hence, A3C is designed to work well for parallel training.

Let’s use the state-value function as an example. The loss function for state value is to minimize the mean squared error, 
𝐽
𝑣
(
𝑤
)
=
(
𝐺
𝑡
−
𝑉
𝑤
(
𝑠
)
)
2
 and gradient descent can be applied to find the optimal w. This state-value function is used as the baseline in the policy gradient update.

Here is the algorithm outline:

We have global parameters, 
𝜃
 and 
𝑤
; similar thread-specific parameters, 
𝜃
′
 and 
𝑤
′
.

Initialize the time step 
𝑡
=
1

While 
𝑇
≤
𝑇
MAX
:

Reset gradient: 
d
𝜃
=
0
 and 
d
𝑤
=
0
.
Synchronize thread-specific parameters with global ones: 
𝜃
′
=
𝜃
 and 
𝑤
′
=
𝑤
.
𝑡
start
 = t and sample a starting state 
𝑠
𝑡
.
While (
𝑠
𝑡
 != TERMINAL) and 
𝑡
−
𝑡
start
≤
𝑡
max
:
Pick the action 
𝐴
𝑡
∼
𝜋
𝜃
′
(
𝐴
𝑡
|
𝑆
𝑡
)
 and receive a new reward 
𝑅
𝑡
 and a new state 
𝑠
𝑡
+
1
.
Update 
𝑡
=
𝑡
+
1
 and 
𝑇
=
𝑇
+
1
Initialize the variable that holds the return estimation
	
	
𝑅
=
{
0
	
if 
𝑠
𝑡
 is TERMINAL


𝑉
𝑤
′
(
𝑠
𝑡
)
	
otherwise
6. For 
𝑖
=
𝑡
−
1
,
…
,
𝑡
_
start
: 1. 
𝑅
←
𝛾
𝑅
+
𝑅
_
𝑖
; here R is a MC measure of 
𝐺
_
𝑖
. 2. Accumulate gradients w.r.t. 
𝜃
′
: 
𝑑
𝜃
←
𝑑
𝜃
+
∇
_
𝜃
′
log
⁡
𝜋
_
𝜃
′
(
𝑎
_
𝑖
|
𝑠
_
𝑖
)
(
𝑅
−
𝑉
_
𝑤
′
(
𝑠
_
𝑖
)
)
;
Accumulate gradients w.r.t. w': 
𝑑
𝑤
←
𝑑
𝑤
+
2
(
𝑅
−
𝑉
_
𝑤
′
(
𝑠
_
𝑖
)
)
∇
_
𝑤
′
(
𝑅
−
𝑉
_
𝑤
′
(
𝑠
_
𝑖
)
)
.
Update asynchronously 
𝜃
 using 
d
𝜃
, and 
𝑤
 using 
d
𝑤
.

A3C enables the parallelism in multiple agent training. The gradient accumulation step (6.2) can be considered as a parallelized reformation of minibatch-based stochastic gradient update: the values of 
𝑤
 or 
𝜃
 get corrected by a little bit in the direction of each training thread independently.

A2C

[paper|code]

A2C is a synchronous, deterministic version of A3C; that’s why it is named as “A2C” with the first “A” (“asynchronous”) removed. In A3C each agent talks to the global parameters independently, so it is possible sometimes the thread-specific agents would be playing with policies of different versions and therefore the aggregated update would not be optimal. To resolve the inconsistency, a coordinator in A2C waits for all the parallel actors to finish their work before updating the global parameters and then in the next iteration parallel actors starts from the same policy. The synchronized gradient update keeps the training more cohesive and potentially to make convergence faster.

A2C has been shown to be able to utilize GPUs more efficiently and work better with large batch sizes while achieving same or better performance than A3C.

The architecture of A3C versus A2C.
DPG

[paper|code]

In methods described above, the policy function 
𝜋
(
.
|
𝑠
)
 is always modeled as a probability distribution over actions 
𝐴
 given the current state and thus it is stochastic. Deterministic policy gradient (DPG) instead models the policy as a deterministic decision: 
𝑎
=
𝜇
(
𝑠
)
. It may look bizarre — how can you calculate the gradient of the action probability when it outputs a single action? Let’s look into it step by step.

Refresh on a few notations to facilitate the discussion:

𝜌
0
(
𝑠
)
: The initial distribution over states
𝜌
𝜇
(
𝑠
→
𝑠
′
,
𝑘
)
: Starting from state s, the visitation probability density at state s’ after moving k steps by policy 
𝜇
.
𝜌
𝜇
(
𝑠
′
)
: Discounted state distribution, defined as 
𝜌
𝜇
(
𝑠
′
)
=
∫
𝑆
∑
𝑘
=
1
∞
𝛾
𝑘
−
1
𝜌
0
(
𝑠
)
𝜌
𝜇
(
𝑠
→
𝑠
′
,
𝑘
)
𝑑
𝑠
.

The objective function to optimize for is listed as follows:

𝐽
(
𝜃
)
=
∫
𝑆
𝜌
𝜇
(
𝑠
)
𝑄
(
𝑠
,
𝜇
𝜃
(
𝑠
)
)
𝑑
𝑠

Deterministic policy gradient theorem: Now it is the time to compute the gradient! According to the chain rule, we first take the gradient of Q w.r.t. the action a and then take the gradient of the deterministic policy function 
𝜇
 w.r.t. 
𝜃
:

	
	
∇
𝜃
𝐽
(
𝜃
)
	
=
∫
𝑆
𝜌
𝜇
(
𝑠
)
∇
𝑎
𝑄
𝜇
(
𝑠
,
𝑎
)
∇
𝜃
𝜇
𝜃
(
𝑠
)
|
𝑎
=
𝜇
𝜃
(
𝑠
)
𝑑
𝑠

	
=
𝐸
𝑠
∼
𝜌
𝜇
[
∇
𝑎
𝑄
𝜇
(
𝑠
,
𝑎
)
∇
𝜃
𝜇
𝜃
(
𝑠
)
|
𝑎
=
𝜇
𝜃
(
𝑠
)
]

We can consider the deterministic policy as a special case of the stochastic one, when the probability distribution contains only one extreme non-zero value over one action. Actually, in the DPG paper, the authors have shown that if the stochastic policy 
𝜋
𝜇
𝜃
,
𝜎
 is re-parameterized by a deterministic policy 
𝜇
𝜃
 and a variation variable 
𝜎
, the stochastic policy is eventually equivalent to the deterministic case when 
𝜎
=
0
. Compared to the deterministic policy, we expect the stochastic policy to require more samples as it integrates the data over the whole state and action space.

The deterministic policy gradient theorem can be plugged into common policy gradient frameworks.

Let’s consider an example of on-policy actor-critic algorithm to showcase the procedure. In each iteration of on-policy actor-critic, two actions are taken deterministically 
𝑎
=
𝜇
𝜃
(
𝑠
)
 and the SARSA update on policy parameters relies on the new gradient that we just computed above:

		
		
		
𝛿
𝑡
	
=
𝑅
𝑡
+
𝛾
𝑄
𝑤
(
𝑠
𝑡
+
1
,
𝑎
𝑡
+
1
)
−
𝑄
𝑤
(
𝑠
𝑡
,
𝑎
𝑡
)
	
; TD error in SARSA


𝑤
𝑡
+
1
	
=
𝑤
𝑡
+
𝛼
𝑤
𝛿
𝑡
∇
𝑤
𝑄
𝑤
(
𝑠
𝑡
,
𝑎
𝑡
)
	

𝜃
𝑡
+
1
	
=
𝜃
𝑡
+
𝛼
𝜃
∇
𝑎
𝑄
𝑤
(
𝑠
𝑡
,
𝑎
𝑡
)
∇
𝜃
𝜇
𝜃
(
𝑠
)
|
𝑎
=
𝜇
𝜃
(
𝑠
)
	
; Deterministic policy gradient theorem

However, unless there is sufficient noise in the environment, it is very hard to guarantee enough exploration due to the determinacy of the policy. We can either add noise into the policy (ironically this makes it nondeterministic!) or learn it off-policy-ly by following a different stochastic behavior policy to collect samples.

Say, in the off-policy approach, the training trajectories are generated by a stochastic policy 
𝛽
(
𝑎
|
𝑠
)
 and thus the state distribution follows the corresponding discounted state density 
𝜌
𝛽
:

	
	
𝐽
𝛽
(
𝜃
)
	
=
∫
𝑆
𝜌
𝛽
𝑄
𝜇
(
𝑠
,
𝜇
𝜃
(
𝑠
)
)
𝑑
𝑠


∇
𝜃
𝐽
𝛽
(
𝜃
)
	
=
𝐸
𝑠
∼
𝜌
𝛽
[
∇
𝑎
𝑄
𝜇
(
𝑠
,
𝑎
)
∇
𝜃
𝜇
𝜃
(
𝑠
)
|
𝑎
=
𝜇
𝜃
(
𝑠
)
]

Note that because the policy is deterministic, we only need 
𝑄
𝜇
(
𝑠
,
𝜇
𝜃
(
𝑠
)
)
 rather than 
∑
𝑎
𝜋
(
𝑎
|
𝑠
)
𝑄
𝜋
(
𝑠
,
𝑎
)
 as the estimated reward of a given state s. In the off-policy approach with a stochastic policy, importance sampling is often used to correct the mismatch between behavior and target policies, as what we have described above. However, because the deterministic policy gradient removes the integral over actions, we can avoid importance sampling.

DDPG

[paper|code]

DDPG (Lillicrap, et al., 2015), short for Deep Deterministic Policy Gradient, is a model-free off-policy actor-critic algorithm, combining DPG with DQN. Recall that DQN (Deep Q-Network) stabilizes the learning of Q-function by experience replay and the frozen target network. The original DQN works in discrete space, and DDPG extends it to continuous space with the actor-critic framework while learning a deterministic policy.

In order to do better exploration, an exploration policy 
𝜇
′
 is constructed by adding noise 
𝑁
:

𝜇
′
(
𝑠
)
=
𝜇
𝜃
(
𝑠
)
+
𝑁

In addition, DDPG does soft updates (“conservative policy iteration”) on the parameters of both actor and critic, with 
𝜏
≪
1
: 
𝜃
′
←
𝜏
𝜃
+
(
1
−
𝜏
)
𝜃
′
. In this way, the target network values are constrained to change slowly, different from the design in DQN that the target network stays frozen for some period of time.

One detail in the paper that is particularly useful in robotics is on how to normalize the different physical units of low dimensional features. For example, a model is designed to learn a policy with the robot’s positions and velocities as input; these physical statistics are different by nature and even statistics of the same type may vary a lot across multiple robots. Batch normalization is applied to fix it by normalizing every dimension across samples in one minibatch.

Fig 3. DDPG Algorithm. (Image source: Lillicrap, et al., 2015)
D4PG

[paper|code (Search “github d4pg” and you will see a few.)]

Distributed Distributional DDPG (D4PG) applies a set of improvements on DDPG to make it run in the distributional fashion.

(1) Distributional Critic: The critic estimates the expected Q value as a random variable ~ a distribution 
𝑍
𝑤
 parameterized by 
𝑤
 and therefore 
𝑄
𝑤
(
𝑠
,
𝑎
)
=
𝐸
𝑍
𝑤
(
𝑥
,
𝑎
)
. The loss for learning the distribution parameter is to minimize some measure of the distance between two distributions — distributional TD error: 
𝐿
(
𝑤
)
=
𝐸
[
𝑑
(
𝑇
𝜇
𝜃
,
𝑍
𝑤
′
(
𝑠
,
𝑎
)
,
𝑍
𝑤
(
𝑠
,
𝑎
)
]
, where 
𝑇
𝜇
𝜃
 is the Bellman operator.

The deterministic policy gradient update becomes:

		
		
∇
𝜃
𝐽
(
𝜃
)
	
≈
𝐸
𝜌
𝜇
[
∇
𝑎
𝑄
𝑤
(
𝑠
,
𝑎
)
∇
𝜃
𝜇
𝜃
(
𝑠
)
|
𝑎
=
𝜇
𝜃
(
𝑠
)
]
	
; gradient update in DPG

	
=
𝐸
𝜌
𝜇
[
𝐸
[
∇
𝑎
𝑍
𝑤
(
𝑠
,
𝑎
)
]
∇
𝜃
𝜇
𝜃
(
𝑠
)
|
𝑎
=
𝜇
𝜃
(
𝑠
)
]
	
; expectation of the Q-value distribution.

(2) 
𝑁
-step returns: When calculating the TD error, D4PG computes 
𝑁
-step TD target rather than one-step to incorporate rewards in more future steps. Thus the new TD target is:



𝑟
(
𝑠
0
,
𝑎
0
)
+
𝐸
[
∑
𝑛
=
1
𝑁
−
1
𝑟
(
𝑠
𝑛
,
𝑎
𝑛
)
+
𝛾
𝑁
𝑄
(
𝑠
𝑁
,
𝜇
𝜃
(
𝑠
𝑁
)
)
|
𝑠
0
,
𝑎
0
]

(3) Multiple Distributed Parallel Actors: D4PG utilizes 
𝐾
 independent actors, gathering experience in parallel and feeding data into the same replay buffer.

(4) Prioritized Experience Replay (PER): The last piece of modification is to do sampling from the replay buffer of size 
𝑅
 with an non-uniform probability 
𝑝
𝑖
. In this way, a sample 
𝑖
 has the probability 
(
𝑅
𝑝
𝑖
)
−
1
 to be selected and thus the importance weight is 
(
𝑅
𝑝
𝑖
)
−
1
.

D4PG algorithm (Image source: Barth-Maron, et al. 2018); Note that in the original paper, the variable letters are chosen slightly differently from what in the post; i.e. I use 
𝜇
(
.
)
 for representing a deterministic policy instead of 
𝜋
(
.
)
.
MADDPG

[paper|code]

Multi-agent DDPG (MADDPG) (Lowe et al., 2017) extends DDPG to an environment where multiple agents are coordinating to complete tasks with only local information. In the viewpoint of one agent, the environment is non-stationary as policies of other agents are quickly upgraded and remain unknown. MADDPG is an actor-critic model redesigned particularly for handling such a changing environment and interactions between agents.

The problem can be formalized in the multi-agent version of MDP, also known as Markov games. MADDPG is proposed for partially observable Markov games. Say, there are N agents in total with a set of states 
𝑆
. Each agent owns a set of possible action, 
𝐴
1
,
…
,
𝐴
𝑁
, and a set of observation, 
𝑂
1
,
…
,
𝑂
𝑁
. The state transition function involves all states, action and observation spaces 
𝑇
:
𝑆
×
𝐴
1
×
…
𝐴
𝑁
↦
𝑆
. Each agent’s stochastic policy only involves its own state and action: 
𝜋
𝜃
𝑖
:
𝑂
𝑖
×
𝐴
𝑖
↦
[
0
,
1
]
, a probability distribution over actions given its own observation, or a deterministic policy: 
𝜇
𝜃
𝑖
:
𝑂
𝑖
↦
𝐴
𝑖
.

Let 
𝑜
→
=
𝑜
1
,
…
,
𝑜
𝑁
, 
𝜇
→
=
𝜇
1
,
…
,
𝜇
𝑁
 and the policies are parameterized by 
𝜃
→
=
𝜃
1
,
…
,
𝜃
𝑁
.

The critic in MADDPG learns a centralized action-value function 
𝑄
𝑖
𝜇
→
(
𝑜
→
,
𝑎
1
,
…
,
𝑎
𝑁
)
 for the i-th agent, where 
𝑎
1
∈
𝐴
1
,
…
,
𝑎
𝑁
∈
𝐴
𝑁
 are actions of all agents. Each 
𝑄
𝑖
𝜇
→
 is learned separately for 
𝑖
=
1
,
…
,
𝑁
 and therefore multiple agents can have arbitrary reward structures, including conflicting rewards in a competitive setting. Meanwhile, multiple actors, one for each agent, are exploring and upgrading the policy parameters 
𝜃
𝑖
 on their own.

Actor update:

∇
𝜃
𝑖
𝐽
(
𝜃
𝑖
)
=
𝐸
𝑜
→
,
𝑎
∼
𝐷
[
∇
𝑎
𝑖
𝑄
𝑖
𝜇
→
(
𝑜
→
,
𝑎
1
,
…
,
𝑎
𝑁
)
∇
𝜃
𝑖
𝜇
𝜃
𝑖
(
𝑜
𝑖
)
|
𝑎
𝑖
=
𝜇
𝜃
𝑖
(
𝑜
𝑖
)
]

Where 
𝐷
 is the memory buffer for experience replay, containing multiple episode samples 
(
𝑜
→
,
𝑎
1
,
…
,
𝑎
𝑁
,
𝑟
1
,
…
,
𝑟
𝑁
,
𝑜
→
′
)
 — given current observation 
𝑜
→
, agents take action 
𝑎
1
,
…
,
𝑎
𝑁
 and get rewards 
𝑟
1
,
…
,
𝑟
𝑁
, leading to the new observation 
𝑜
→
′
.

Critic update:

	
	
	
	
𝐿
(
𝜃
𝑖
)
	
=
𝐸
𝑜
→
,
𝑎
1
,
…
,
𝑎
𝑁
,
𝑟
1
,
…
,
𝑟
𝑁
,
𝑜
→
′
[
(
𝑄
𝑖
𝜇
→
(
𝑜
→
,
𝑎
1
,
…
,
𝑎
𝑁
)
−
𝑦
)
2
]
	

where 
𝑦
	
=
𝑟
𝑖
+
𝛾
𝑄
𝑖
𝜇
→
′
(
𝑜
→
′
,
𝑎
1
′
,
…
,
𝑎
𝑁
′
)
|
𝑎
𝑗
′
=
𝜇
𝜃
𝑗
′
	
; TD target!

where 
𝜇
→
′
 are the target policies with delayed softly-updated parameters.

If the policies 
𝜇
→
 are unknown during the critic update, we can ask each agent to learn and evolve its own approximation of others’ policies. Using the approximated policies, MADDPG still can learn efficiently although the inferred policies might not be accurate.

To mitigate the high variance triggered by the interaction between competing or collaborating agents in the environment, MADDPG proposed one more element - policy ensembles:

Train K policies for one agent;
Pick a random policy for episode rollouts;
Take an ensemble of these K policies to do gradient update.

In summary, MADDPG added three additional ingredients on top of DDPG to make it adapt to the multi-agent environment:

Centralized critic + decentralized actors;
Actors are able to use estimated policies of other agents for learning;
Policy ensembling is good for reducing variance.
The architecture design of MADDPG. (Image source: Lowe et al., 2017)
TRPO

[paper|code]

To improve training stability, we should avoid parameter updates that change the policy too much at one step. Trust region policy optimization (TRPO) (Schulman, et al., 2015) carries out this idea by enforcing a KL divergence constraint on the size of policy update at each iteration.

Consider the case when we are doing off-policy RL, the policy 
𝛽
 used for collecting trajectories on rollout workers is different from the policy 
𝜋
 to optimize for. The objective function in an off-policy model measures the total advantage over the state visitation distribution and actions, while the mismatch between the training data distribution and the true policy state distribution is compensated by importance sampling estimator:

	


	
	


	
	
	
𝐽
(
𝜃
)
	
=
∑
𝑠
∈
𝑆
𝜌
𝜋
𝜃
old
∑
𝑎
∈
𝐴
(
𝜋
𝜃
(
𝑎
|
𝑠
)
𝐴
^
𝜃
old
(
𝑠
,
𝑎
)
)
	
	
=
∑
𝑠
∈
𝑆
𝜌
𝜋
𝜃
old
∑
𝑎
∈
𝐴
(
𝛽
(
𝑎
|
𝑠
)
𝜋
𝜃
(
𝑎
|
𝑠
)
𝛽
(
𝑎
|
𝑠
)
𝐴
^
𝜃
old
(
𝑠
,
𝑎
)
)
	
; Importance sampling

	
=
𝐸
𝑠
∼
𝜌
𝜋
𝜃
old
,
𝑎
∼
𝛽
[
𝜋
𝜃
(
𝑎
|
𝑠
)
𝛽
(
𝑎
|
𝑠
)
𝐴
^
𝜃
old
(
𝑠
,
𝑎
)
]
	

where 
𝜃
old
 is the policy parameters before the update and thus known to us; 
𝜌
𝜋
𝜃
old
 is defined in the same way as above; 
𝛽
(
𝑎
|
𝑠
)
 is the behavior policy for collecting trajectories. Noted that we use an estimated advantage 
𝐴
^
(
.
)
 rather than the true advantage function 
𝐴
(
.
)
 because the true rewards are usually unknown.

When training on policy, theoretically the policy for collecting data is same as the policy that we want to optimize. However, when rollout workers and optimizers are running in parallel asynchronously, the behavior policy can get stale. TRPO considers this subtle difference: It labels the behavior policy as 
𝜋
𝜃
old
(
𝑎
|
𝑠
)
 and thus the objective function becomes:

𝐽
(
𝜃
)
=
𝐸
𝑠
∼
𝜌
𝜋
𝜃
old
,
𝑎
∼
𝜋
𝜃
old
[
𝜋
𝜃
(
𝑎
|
𝑠
)
𝜋
𝜃
old
(
𝑎
|
𝑠
)
𝐴
^
𝜃
old
(
𝑠
,
𝑎
)
]

TRPO aims to maximize the objective function 
𝐽
(
𝜃
)
 subject to, trust region constraint which enforces the distance between old and new policies measured by KL-divergence to be small enough, within a parameter δ:

𝐸
𝑠
∼
𝜌
𝜋
𝜃
old
[
𝐷
KL
(
𝜋
𝜃
old
(
.
|
𝑠
)
‖
𝜋
𝜃
(
.
|
𝑠
)
]
≤
𝛿

In this way, the old and new policies would not diverge too much when this hard constraint is met. While still, TRPO can guarantee a monotonic improvement over policy iteration (Neat, right?). Please read the proof in the paper if interested :)

PPO

[paper|code]

Given that TRPO is relatively complicated and we still want to implement a similar constraint, proximal policy optimization (PPO) simplifies it by using a clipped surrogate objective while retaining similar performance.

First, let’s denote the probability ratio between old and new policies as:

𝑟
(
𝜃
)
=
𝜋
𝜃
(
𝑎
|
𝑠
)
𝜋
𝜃
old
(
𝑎
|
𝑠
)

Then, the objective function of TRPO (on policy) becomes:

𝐽
TRPO
(
𝜃
)
=
𝐸
[
𝑟
(
𝜃
)
𝐴
^
𝜃
old
(
𝑠
,
𝑎
)
]

Without a limitation on the distance between 
𝜃
old
 and 
𝜃
, to maximize 
𝐽
TRPO
(
𝜃
)
 would lead to instability with extremely large parameter updates and big policy ratios. PPO imposes the constraint by forcing 
𝑟
(
𝜃
)
 to stay within a small interval around 1, precisely 
[
1
−
𝜖
,
1
+
𝜖
]
, where 
𝜖
 is a hyperparameter.

𝐽
CLIP
(
𝜃
)
=
𝐸
[
min
(
𝑟
(
𝜃
)
𝐴
^
𝜃
old
(
𝑠
,
𝑎
)
,
clip
(
𝑟
(
𝜃
)
,
1
−
𝜖
,
1
+
𝜖
)
𝐴
^
𝜃
old
(
𝑠
,
𝑎
)
)
]

The function 
clip
(
𝑟
(
𝜃
)
,
1
−
𝜖
,
1
+
𝜖
)
 clips the ratio to be no more than 
1
+
𝜖
 and no less than 
1
−
𝜖
. The objective function of PPO takes the minimum one between the original value and the clipped version and therefore we lose the motivation for increasing the policy update to extremes for better rewards.

When applying PPO on the network architecture with shared parameters for both policy (actor) and value (critic) functions, in addition to the clipped reward, the objective function is augmented with an error term on the value estimation (formula in red) and an entropy term (formula in blue) to encourage sufficient exploration.

𝐽
CLIP'
(
𝜃
)
=
𝐸
[
𝐽
CLIP
(
𝜃
)
−
𝑐
1
(
𝑉
𝜃
(
𝑠
)
−
𝑉
target
)
2
+
𝑐
2
𝐻
(
𝑠
,
𝜋
𝜃
(
.
)
)
]

where Both 
𝑐
1
 and 
𝑐
2
 are two hyperparameter constants.

PPO has been tested on a set of benchmark tasks and proved to produce awesome results with much greater simplicity.

In a later paper by Hsu et al., 2020, two common design choices in PPO are revisited, precisely (1) clipped probability ratio for policy regularization and (2) parameterize policy action space by continuous Gaussian or discrete softmax distribution. They first identified three failure modes in PPO and proposed replacements for these two designs.

The failure modes are:

On continuous action spaces, standard PPO is unstable when rewards vanish outside bounded support.
On discrete action spaces with sparse high rewards, standard PPO often gets stuck at suboptimal actions.
The policy is sensitive to initialization when there are locally optimal actions close to initialization.

Discretizing the action space or use Beta distribution helps avoid failure mode 1&3 associated with Gaussian policy. Using KL regularization (same motivation as in TRPO) as an alternative surrogate model helps resolve failure mode 1&2.

PPG

[paper|code]

Sharing parameters between policy and value networks have pros and cons. It allows policy and value functions to share the learned features with each other, but it may cause conflicts between competing objectives and demands the same data for training two networks at the same time. Phasic policy gradient (PPG; Cobbe, et al 2020) modifies the traditional on-policy actor-critic policy gradient algorithm. precisely PPO, to have separate training phases for policy and value functions. In two alternating phases:

The policy phase: updates the policy network by optimizing the PPO objective 
𝐿
CLIP
(
𝜃
)
;
The auxiliary phase: optimizes an auxiliary objective alongside a behavioral cloning loss. In the paper, value function error is the sole auxiliary objective, but it can be quite general and includes any other additional auxiliary losses.
	
	
𝐿
joint
	
=
𝐿
aux
+
𝛽
clone
⋅
𝐸
𝑡
[
KL
[
𝜋
𝜃
old
(
⋅
∣
𝑠
𝑡
)
,
𝜋
𝜃
(
⋅
∣
𝑠
𝑡
)
]
]


𝐿
aux
	
=
𝐿
value
=
𝐸
𝑡
[
1
2
(
𝑉
𝑤
(
𝑠
𝑡
)
−
𝑉
^
𝑡
targ
)
2
]

where 
𝛽
clone
 is a hyperparameter for controlling how much we would like to keep the policy not diverge too much from its original behavior while optimizing the auxiliary objectives.

The algorithm of PPG. (Image source: Cobbe, et al 2020)

where

𝑁
𝜋
 is the number of policy update iterations in the policy phase. Note that the policy phase performs multiple iterations of updates per single auxiliary phase.
𝐸
𝜋
 and 
𝐸
𝑉
 control the sample reuse (i.e. the number of training epochs performed across data in the reply buffer) for the policy and value functions, respectively. Note that this happens within the policy phase and thus 
𝐸
𝑉
 affects the learning of true value function not the auxiliary value function.
𝐸
aux
 defines the sample reuse in the auxiliary phrase. In PPG, value function optimization can tolerate a much higher level sample reuse; for example, in the experiments of the paper, 
𝐸
aux
=
6
 while 
𝐸
𝜋
=
𝐸
𝑉
=
1
.

PPG leads to a significant improvement on sample efficiency compared to PPO.

The mean normalized performance of PPG vs PPO on the Procgen benchmark. (Image source: Cobbe, et al 2020)
ACER

[paper|code]

ACER, short for actor-critic with experience replay (Wang, et al., 2017), is an off-policy actor-critic model with experience replay, greatly increasing the sample efficiency and decreasing the data correlation. A3C builds up the foundation for ACER, but it is on policy; ACER is A3C’s off-policy counterpart. The major obstacle to making A3C off policy is how to control the stability of the off-policy estimator. ACER proposes three designs to overcome it:

Use Retrace Q-value estimation;
Truncate the importance weights with bias correction;
Apply efficient TRPO.

Retrace Q-value Estimation

Retrace is an off-policy return-based Q-value estimation algorithm with a nice guarantee for convergence for any target and behavior policy pair 
(
𝜋
,
𝛽
)
, plus good data efficiency.

Recall how TD learning works for prediction:

Compute TD error: 
𝛿
𝑡
=
𝑅
𝑡
+
𝛾
𝐸
𝑎
∼
𝜋
𝑄
(
𝑆
𝑡
+
1
,
𝑎
)
−
𝑄
(
𝑆
𝑡
,
𝐴
𝑡
)
; the term 
𝑟
𝑡
+
𝛾
𝐸
𝑎
∼
𝜋
𝑄
(
𝑠
𝑡
+
1
,
𝑎
)
 is known as “TD target”. The expectation 
𝐸
𝑎
∼
𝜋
 is used because for the future step the best estimation we can make is what the return would be if we follow the current policy 
𝜋
.
Update the value by correcting the error to move toward the goal: 
𝑄
(
𝑆
𝑡
,
𝐴
𝑡
)
←
𝑄
(
𝑆
𝑡
,
𝐴
𝑡
)
+
𝛼
𝛿
𝑡
. In other words, the incremental update on Q is proportional to the TD error: 
Δ
𝑄
(
𝑆
𝑡
,
𝐴
𝑡
)
=
𝛼
𝛿
𝑡
.

When the rollout is off policy, we need to apply importance sampling on the Q update:



Δ
𝑄
imp
(
𝑆
𝑡
,
𝐴
𝑡
)
=
𝛾
𝑡
∏
1
≤
𝜏
≤
𝑡
𝜋
(
𝐴
𝜏
|
𝑆
𝜏
)
𝛽
(
𝐴
𝜏
|
𝑆
𝜏
)
𝛿
𝑡

The product of importance weights looks pretty scary when we start imagining how it can cause super high variance and even explode. Retrace Q-value estimation method modifies 
Δ
𝑄
 to have importance weights truncated by no more than a constant 
𝑐
:



Δ
𝑄
ret
(
𝑆
𝑡
,
𝐴
𝑡
)
=
𝛾
𝑡
∏
1
≤
𝜏
≤
𝑡
min
(
𝑐
,
𝜋
(
𝐴
𝜏
|
𝑆
𝜏
)
𝛽
(
𝐴
𝜏
|
𝑆
𝜏
)
)
𝛿
𝑡

ACER uses 
𝑄
ret
 as the target to train the critic by minimizing the L2 error term: 
(
𝑄
ret
(
𝑠
,
𝑎
)
−
𝑄
(
𝑠
,
𝑎
)
)
2
.

Importance weights truncation

To reduce the high variance of the policy gradient 
𝑔
^
, ACER truncates the importance weights by a constant c, plus a correction term. The label 
𝑔
^
𝑡
acer
 is the ACER policy gradient at time t.

		

		
	
	
𝑔
^
𝑡
acer
=
	
𝜔
𝑡
(
𝑄
ret
(
𝑆
𝑡
,
𝐴
𝑡
)
−
𝑉
𝜃
𝑣
(
𝑆
𝑡
)
)
∇
𝜃
ln
⁡
𝜋
𝜃
(
𝐴
𝑡
|
𝑆
𝑡
)
	
; Let 
𝜔
𝑡
=
𝜋
(
𝐴
𝑡
|
𝑆
𝑡
)
𝛽
(
𝐴
𝑡
|
𝑆
𝑡
)


=
	
min
(
𝑐
,
𝜔
𝑡
)
(
𝑄
ret
(
𝑆
𝑡
,
𝐴
𝑡
)
−
𝑉
𝑤
(
𝑆
𝑡
)
)
∇
𝜃
ln
⁡
𝜋
𝜃
(
𝐴
𝑡
|
𝑆
𝑡
)

	
+
𝐸
𝑎
∼
𝜋
[
max
(
0
,
𝜔
𝑡
(
𝑎
)
−
𝑐
𝜔
𝑡
(
𝑎
)
)
(
𝑄
𝑤
(
𝑆
𝑡
,
𝑎
)
−
𝑉
𝑤
(
𝑆
𝑡
)
)
∇
𝜃
ln
⁡
𝜋
𝜃
(
𝑎
|
𝑆
𝑡
)
]
	
; Let 
𝜔
𝑡
(
𝑎
)
=
𝜋
(
𝑎
|
𝑆
𝑡
)
𝛽
(
𝑎
|
𝑆
𝑡
)

where 
𝑄
𝑤
(
.
)
 and 
𝑉
𝑤
(
.
)
 are value functions predicted by the critic with parameter w. The first term (blue) contains the clipped important weight. The clipping helps reduce the variance, in addition to subtracting state value function 
𝑉
𝑤
(
.
)
 as a baseline. The second term (red) makes a correction to achieve unbiased estimation.

Efficient TRPO

Furthermore, ACER adopts the idea of TRPO but with a small adjustment to make it more computationally efficient: rather than measuring the KL divergence between policies before and after one update, ACER maintains a running average of past policies and forces the updated policy to not deviate far from this average.

The ACER paper is pretty dense with many equations. Hopefully, with the prior knowledge on TD learning, Q-learning, importance sampling and TRPO, you will find the paper slightly easier to follow :)

ACTKR

[paper|code]

ACKTR (actor-critic using Kronecker-factored trust region) (Yuhuai Wu, et al., 2017) proposed to use Kronecker-factored approximation curvature (K-FAC) to do the gradient update for both the critic and actor. K-FAC made an improvement on the computation of natural gradient, which is quite different from our standard gradient. Here is a nice, intuitive explanation of natural gradient. One sentence summary is probably:

“we first consider all combinations of parameters that result in a new network a constant KL divergence away from the old network. This constant value can be viewed as the step size or learning rate. Out of all these possible combinations, we choose the one that minimizes our loss function.”

I listed ACTKR here mainly for the completeness of this post, but I would not dive into details, as it involves a lot of theoretical knowledge on natural gradient and optimization methods. If interested, check these papers/posts, before reading the ACKTR paper:

Amari. Natural Gradient Works Efficiently in Learning. 1998
Kakade. A Natural Policy Gradient. 2002
A intuitive explanation of natural gradient descent
Wiki: Kronecker product
Martens & Grosse. Optimizing neural networks with kronecker-factored approximate curvature. 2015.

Here is a high level summary from the K-FAC paper:

“This approximation is built in two stages. In the first, the rows and columns of the Fisher are divided into groups, each of which corresponds to all the weights in a given layer, and this gives rise to a block-partitioning of the matrix. These blocks are then approximated as Kronecker products between much smaller matrices, which we show is equivalent to making certain approximating assumptions regarding the statistics of the network’s gradients.

In the second stage, this matrix is further approximated as having an inverse which is either block-diagonal or block-tridiagonal. We justify this approximation through a careful examination of the relationships between inverse covariances, tree-structured graphical models, and linear regression. Notably, this justification doesn’t apply to the Fisher itself, and our experiments confirm that while the inverse Fisher does indeed possess this structure (approximately), the Fisher itself does not.”

SAC

[paper|code]

Soft Actor-Critic (SAC) (Haarnoja et al. 2018) incorporates the entropy measure of the policy into the reward to encourage exploration: we expect to learn a policy that acts as randomly as possible while it is still able to succeed at the task. It is an off-policy actor-critic model following the maximum entropy reinforcement learning framework. A precedent work is Soft Q-learning.

Three key components in SAC:

An actor-critic architecture with separate policy and value function networks;
An off-policy formulation that enables reuse of previously collected data for efficiency;
Entropy maximization to enable stability and exploration.

The policy is trained with the objective to maximize the expected return and the entropy at the same time:



𝐽
(
𝜃
)
=
∑
𝑡
=
1
𝑇
𝐸
(
𝑠
𝑡
,
𝑎
𝑡
)
∼
𝜌
𝜋
𝜃
[
𝑟
(
𝑠
𝑡
,
𝑎
𝑡
)
+
𝛼
𝐻
(
𝜋
𝜃
(
.
|
𝑠
𝑡
)
)
]

where 
𝐻
(
.
)
 is the entropy measure and 
𝛼
 controls how important the entropy term is, known as temperature parameter. The entropy maximization leads to policies that can (1) explore more and (2) capture multiple modes of near-optimal strategies (i.e., if there exist multiple options that seem to be equally good, the policy should assign each with an equal probability to be chosen).

Precisely, SAC aims to learn three functions:

The policy with parameter 
𝜃
, 
𝜋
𝜃
.
Soft Q-value function parameterized by 
𝑤
, 
𝑄
𝑤
.
Soft state value function parameterized by 
𝜓
, 
𝑉
𝜓
; theoretically we can infer 
𝑉
 by knowing 
𝑄
 and 
𝜋
, but in practice, it helps stabilize the training.

Soft Q-value and soft state value are defined as:

		
		
𝑄
(
𝑠
𝑡
,
𝑎
𝑡
)
	
=
𝑟
(
𝑠
𝑡
,
𝑎
𝑡
)
+
𝛾
𝐸
𝑠
𝑡
+
1
∼
𝜌
𝜋
(
𝑠
)
[
𝑉
(
𝑠
𝑡
+
1
)
]
	
; according to Bellman equation.


where 
𝑉
(
𝑠
𝑡
)
	
=
𝐸
𝑎
𝑡
∼
𝜋
[
𝑄
(
𝑠
𝑡
,
𝑎
𝑡
)
−
𝛼
log
⁡
𝜋
(
𝑎
𝑡
|
𝑠
𝑡
)
]
	
; soft state value function.
Thus, 
𝑄
(
𝑠
𝑡
,
𝑎
𝑡
)
=
𝑟
(
𝑠
𝑡
,
𝑎
𝑡
)
+
𝛾
𝐸
(
𝑠
𝑡
+
1
,
𝑎
𝑡
+
1
)
∼
𝜌
𝜋
[
𝑄
(
𝑠
𝑡
+
1
,
𝑎
𝑡
+
1
)
−
𝛼
log
⁡
𝜋
(
𝑎
𝑡
+
1
|
𝑠
𝑡
+
1
)
]

𝜌
𝜋
(
𝑠
)
 and 
𝜌
𝜋
(
𝑠
,
𝑎
)
 denote the state and the state-action marginals of the state distribution induced by the policy 
𝜋
(
𝑎
|
𝑠
)
; see the similar definitions in DPG section.

The soft state value function is trained to minimize the mean squared error:

	

	
𝐽
𝑉
(
𝜓
)
	
=
𝐸
𝑠
𝑡
∼
𝐷
[
1
2
(
𝑉
𝜓
(
𝑠
𝑡
)
−
𝐸
[
𝑄
𝑤
(
𝑠
𝑡
,
𝑎
𝑡
)
−
log
⁡
𝜋
𝜃
(
𝑎
𝑡
|
𝑠
𝑡
)
]
)
2
]


with gradient: 
∇
𝜓
𝐽
𝑉
(
𝜓
)
	
=
∇
𝜓
𝑉
𝜓
(
𝑠
𝑡
)
(
𝑉
𝜓
(
𝑠
𝑡
)
−
𝑄
𝑤
(
𝑠
𝑡
,
𝑎
𝑡
)
+
log
⁡
𝜋
𝜃
(
𝑎
𝑡
|
𝑠
𝑡
)
)

where 
𝐷
 is the replay buffer.

The soft Q function is trained to minimize the soft Bellman residual:

	

	
𝐽
𝑄
(
𝑤
)
	
=
𝐸
(
𝑠
𝑡
,
𝑎
𝑡
)
∼
𝐷
[
1
2
(
𝑄
𝑤
(
𝑠
𝑡
,
𝑎
𝑡
)
−
(
𝑟
(
𝑠
𝑡
,
𝑎
𝑡
)
+
𝛾
𝐸
𝑠
𝑡
+
1
∼
𝜌
𝜋
(
𝑠
)
[
𝑉
𝜓
¯
(
𝑠
𝑡
+
1
)
]
)
)
2
]


with gradient: 
∇
𝑤
𝐽
𝑄
(
𝑤
)
	
=
∇
𝑤
𝑄
𝑤
(
𝑠
𝑡
,
𝑎
𝑡
)
(
𝑄
𝑤
(
𝑠
𝑡
,
𝑎
𝑡
)
−
𝑟
(
𝑠
𝑡
,
𝑎
𝑡
)
−
𝛾
𝑉
𝜓
¯
(
𝑠
𝑡
+
1
)
)

where 
𝜓
¯
 is the target value function which is the exponential moving average (or only gets updated periodically in a “hard” way), just like how the parameter of the target Q network is treated in DQN to stabilize the training.

SAC updates the policy to minimize the KL-divergence:

	


	

	
	

	
𝜋
new
	
=
arg
⁡
min
𝜋
′
∈
Π
𝐷
KL
(
𝜋
′
(
.
|
𝑠
𝑡
)
‖
exp
⁡
(
𝑄
𝜋
old
(
𝑠
𝑡
,
.
)
)
𝑍
𝜋
old
(
𝑠
𝑡
)
)

	
=
arg
⁡
min
𝜋
′
∈
Π
𝐷
KL
(
𝜋
′
(
.
|
𝑠
𝑡
)
‖
exp
⁡
(
𝑄
𝜋
old
(
𝑠
𝑡
,
.
)
−
log
⁡
𝑍
𝜋
old
(
𝑠
𝑡
)
)
)


objective for update: 
𝐽
𝜋
(
𝜃
)
	
=
∇
𝜃
𝐷
KL
(
𝜋
𝜃
(
.
|
𝑠
𝑡
)
‖
exp
⁡
(
𝑄
𝑤
(
𝑠
𝑡
,
.
)
−
log
⁡
𝑍
𝑤
(
𝑠
𝑡
)
)
)

	
=
𝐸
𝑎
𝑡
∼
𝜋
[
−
log
⁡
(
exp
⁡
(
𝑄
𝑤
(
𝑠
𝑡
,
𝑎
𝑡
)
−
log
⁡
𝑍
𝑤
(
𝑠
𝑡
)
)
𝜋
𝜃
(
𝑎
𝑡
|
𝑠
𝑡
)
)
]

	
=
𝐸
𝑎
𝑡
∼
𝜋
[
log
⁡
𝜋
𝜃
(
𝑎
𝑡
|
𝑠
𝑡
)
−
𝑄
𝑤
(
𝑠
𝑡
,
𝑎
𝑡
)
+
log
⁡
𝑍
𝑤
(
𝑠
𝑡
)
]

where 
Π
 is the set of potential policies that we can model our policy as to keep them tractable; for example, 
Π
 can be the family of Gaussian mixture distributions, expensive to model but highly expressive and still tractable. 
𝑍
𝜋
old
(
𝑠
𝑡
)
 is the partition function to normalize the distribution. It is usually intractable but does not contribute to the gradient. How to minimize 
𝐽
𝜋
(
𝜃
)
 depends our choice of 
Π
.

This update guarantees that 
𝑄
𝜋
new
(
𝑠
𝑡
,
𝑎
𝑡
)
≥
𝑄
𝜋
old
(
𝑠
𝑡
,
𝑎
𝑡
)
, please check the proof on this lemma in the Appendix B.2 in the original paper.

Once we have defined the objective functions and gradients for soft action-state value, soft state value and the policy network, the soft actor-critic algorithm is straightforward:

The soft actor-critic algorithm. (Image source: original paper)
SAC with Automatically Adjusted Temperature

[paper|code]

SAC is brittle with respect to the temperature parameter. Unfortunately it is difficult to adjust temperature, because the entropy can vary unpredictably both across tasks and during training as the policy becomes better. An improvement on SAC formulates a constrained optimization problem: while maximizing the expected return, the policy should satisfy a minimum entropy constraint:





max
𝜋
0
,
…
,
𝜋
𝑇
𝐸
[
∑
𝑡
=
0
𝑇
𝑟
(
𝑠
𝑡
,
𝑎
𝑡
)
]
s.t. 
∀
𝑡
, 
𝐻
(
𝜋
𝑡
)
≥
𝐻
0

where 
𝐻
0
 is a predefined minimum policy entropy threshold.

The expected return 
𝐸
[
∑
𝑡
=
0
𝑇
𝑟
(
𝑠
𝑡
,
𝑎
𝑡
)
]
 can be decomposed into a sum of rewards at all the time steps. Because the policy 
𝜋
𝑡
 at time t has no effect on the policy at the earlier time step, 
𝜋
𝑡
−
1
, we can maximize the return at different steps backward in time — this is essentially DP.





				

				

				

max
𝜋
0
(
𝐸
[
𝑟
(
𝑠
0
,
𝑎
0
)
]
+
max
𝜋
1
(
𝐸
[
.
.
.
]
+
max
𝜋
𝑇
𝐸
[
𝑟
(
𝑠
𝑇
,
𝑎
𝑇
)
]
⏟
1st maximization
)
⏟
second but last maximization
)
⏟
last maximization

where we consider 
𝛾
=
1
.

So we start the optimization from the last timestep 
𝑇
:

maximize 
𝐸
(
𝑠
𝑇
,
𝑎
𝑇
)
∼
𝜌
𝜋
[
𝑟
(
𝑠
𝑇
,
𝑎
𝑇
)
]
 s.t. 
𝐻
(
𝜋
𝑇
)
−
𝐻
0
≥
0

First, let us define the following functions:

	
		
	
ℎ
(
𝜋
𝑇
)
	
=
𝐻
(
𝜋
𝑇
)
−
𝐻
0
=
𝐸
(
𝑠
𝑇
,
𝑎
𝑇
)
∼
𝜌
𝜋
[
−
log
⁡
𝜋
𝑇
(
𝑎
𝑇
|
𝑠
𝑇
)
]
−
𝐻
0


𝑓
(
𝜋
𝑇
)
	
=
{
𝐸
(
𝑠
𝑇
,
𝑎
𝑇
)
∼
𝜌
𝜋
[
𝑟
(
𝑠
𝑇
,
𝑎
𝑇
)
]
,
	
if 
ℎ
(
𝜋
𝑇
)
≥
0


−
∞
,
	
otherwise

And the optimization becomes:

maximize 
𝑓
(
𝜋
𝑇
)
 s.t. 
ℎ
(
𝜋
𝑇
)
≥
0

To solve the maximization optimization with inequality constraint, we can construct a Lagrangian expression with a Lagrange multiplier (also known as “dual variable”), 
𝛼
𝑇
:

𝐿
(
𝜋
𝑇
,
𝛼
𝑇
)
=
𝑓
(
𝜋
𝑇
)
+
𝛼
𝑇
ℎ
(
𝜋
𝑇
)

Considering the case when we try to minimize 
𝐿
(
𝜋
𝑇
,
𝛼
𝑇
)
 with respect to 
𝛼
𝑇
 - given a particular value 
𝜋
𝑇
,

If the constraint is satisfied, 
ℎ
(
𝜋
𝑇
)
≥
0
, at best we can set 
𝛼
𝑇
=
0
 since we have no control over the value of 
𝑓
(
𝜋
𝑇
)
. Thus, 
𝐿
(
𝜋
𝑇
,
0
)
=
𝑓
(
𝜋
𝑇
)
.
If the constraint is invalidated, 
ℎ
(
𝜋
𝑇
)
<
0
, we can achieve 
𝐿
(
𝜋
𝑇
,
𝛼
𝑇
)
→
−
∞
 by taking 
𝛼
𝑇
→
∞
. Thus, 
𝐿
(
𝜋
𝑇
,
∞
)
=
−
∞
=
𝑓
(
𝜋
𝑇
)
.

In either case, we can recover the following equation,



𝑓
(
𝜋
𝑇
)
=
min
𝛼
𝑇
≥
0
𝐿
(
𝜋
𝑇
,
𝛼
𝑇
)

At the same time, we want to maximize 
𝑓
(
𝜋
𝑇
)
,





max
𝜋
𝑇
𝑓
(
𝜋
𝑇
)
=
min
𝛼
𝑇
≥
0
max
𝜋
𝑇
𝐿
(
𝜋
𝑇
,
𝛼
𝑇
)

Therefore, to maximize 
𝑓
(
𝜋
𝑇
)
, the dual problem is listed as below. Note that to make sure 
max
𝜋
𝑇
𝑓
(
𝜋
𝑇
)
 is properly maximized and would not become 
−
∞
, the constraint has to be satisfied.


	

	


	


	


	


	


max
𝜋
𝑇
𝐸
[
𝑟
(
𝑠
𝑇
,
𝑎
𝑇
)
]
	
=
max
𝜋
𝑇
𝑓
(
𝜋
𝑇
)

	
=
min
𝛼
𝑇
≥
0
max
𝜋
𝑇
𝐿
(
𝜋
𝑇
,
𝛼
𝑇
)

	
=
min
𝛼
𝑇
≥
0
max
𝜋
𝑇
𝑓
(
𝜋
𝑇
)
+
𝛼
𝑇
ℎ
(
𝜋
𝑇
)

	
=
min
𝛼
𝑇
≥
0
max
𝜋
𝑇
𝐸
(
𝑠
𝑇
,
𝑎
𝑇
)
∼
𝜌
𝜋
[
𝑟
(
𝑠
𝑇
,
𝑎
𝑇
)
]
+
𝛼
𝑇
(
𝐸
(
𝑠
𝑇
,
𝑎
𝑇
)
∼
𝜌
𝜋
[
−
log
⁡
𝜋
𝑇
(
𝑎
𝑇
|
𝑠
𝑇
)
]
−
𝐻
0
)

	
=
min
𝛼
𝑇
≥
0
max
𝜋
𝑇
𝐸
(
𝑠
𝑇
,
𝑎
𝑇
)
∼
𝜌
𝜋
[
𝑟
(
𝑠
𝑇
,
𝑎
𝑇
)
−
𝛼
𝑇
log
⁡
𝜋
𝑇
(
𝑎
𝑇
|
𝑠
𝑇
)
]
−
𝛼
𝑇
𝐻
0

	
=
min
𝛼
𝑇
≥
0
max
𝜋
𝑇
𝐸
(
𝑠
𝑇
,
𝑎
𝑇
)
∼
𝜌
𝜋
[
𝑟
(
𝑠
𝑇
,
𝑎
𝑇
)
+
𝛼
𝑇
𝐻
(
𝜋
𝑇
)
−
𝛼
𝑇
𝐻
0
]

We could compute the optimal 
𝜋
𝑇
 and 
𝛼
𝑇
 iteratively. First given the current 
𝛼
𝑇
, get the best policy 
𝜋
𝑇
∗
 that maximizes 
𝐿
(
𝜋
𝑇
∗
,
𝛼
𝑇
)
. Then plug in 
𝜋
𝑇
∗
 and compute 
𝛼
𝑇
∗
 that minimizes 
𝐿
(
𝜋
𝑇
∗
,
𝛼
𝑇
)
. Assuming we have one neural network for policy and one network for temperature parameter, the iterative update process is more aligned with how we update network parameters during training.

	


	

𝜋
𝑇
∗
	
=
arg
⁡
max
𝜋
𝑇
𝐸
(
𝑠
𝑇
,
𝑎
𝑇
)
∼
𝜌
𝜋
[
𝑟
(
𝑠
𝑇
,
𝑎
𝑇
)
+
𝛼
𝑇
𝐻
(
𝜋
𝑇
)
−
𝛼
𝑇
𝐻
0
]


𝛼
𝑇
∗
	
=
arg
⁡
min
𝛼
𝑇
≥
0
𝐸
(
𝑠
𝑇
,
𝑎
𝑇
)
∼
𝜌
𝜋
∗
[
𝛼
𝑇
𝐻
(
𝜋
𝑇
∗
)
−
𝛼
𝑇
𝐻
0
]


Thus, 
max
𝜋
𝑇
𝐸
[
𝑟
(
𝑠
𝑇
,
𝑎
𝑇
)
]
=
𝐸
(
𝑠
𝑇
,
𝑎
𝑇
)
∼
𝜌
𝜋
∗
[
𝑟
(
𝑠
𝑇
,
𝑎
𝑇
)
+
𝛼
𝑇
∗
𝐻
(
𝜋
𝑇
∗
)
−
𝛼
𝑇
∗
𝐻
0
]

Now let’s go back to the soft Q value function:

		
		

	

	
𝑄
𝑇
−
1
(
𝑠
𝑇
−
1
,
𝑎
𝑇
−
1
)
	
=
𝑟
(
𝑠
𝑇
−
1
,
𝑎
𝑇
−
1
)
+
𝐸
[
𝑄
(
𝑠
𝑇
,
𝑎
𝑇
)
−
𝛼
𝑇
log
⁡
𝜋
(
𝑎
𝑇
|
𝑠
𝑇
)
]

	
=
𝑟
(
𝑠
𝑇
−
1
,
𝑎
𝑇
−
1
)
+
𝐸
[
𝑟
(
𝑠
𝑇
,
𝑎
𝑇
)
]
+
𝛼
𝑇
𝐻
(
𝜋
𝑇
)


𝑄
𝑇
−
1
∗
(
𝑠
𝑇
−
1
,
𝑎
𝑇
−
1
)
	
=
𝑟
(
𝑠
𝑇
−
1
,
𝑎
𝑇
−
1
)
+
max
𝜋
𝑇
𝐸
[
𝑟
(
𝑠
𝑇
,
𝑎
𝑇
)
]
+
𝛼
𝑇
𝐻
(
𝜋
𝑇
∗
)
	
; plug in the optimal 
𝜋
𝑇
∗

Therefore the expected return is as follows, when we take one step further back to the time step 
𝑇
−
1
:

	

	
	

	
	


	
	


	
	
max
𝜋
𝑇
−
1
(
𝐸
[
𝑟
(
𝑠
𝑇
−
1
,
𝑎
𝑇
−
1
)
]
+
max
𝜋
𝑇
𝐸
[
𝑟
(
𝑠
𝑇
,
𝑎
𝑇
]
)

	
=
max
𝜋
𝑇
−
1
(
𝑄
𝑇
−
1
∗
(
𝑠
𝑇
−
1
,
𝑎
𝑇
−
1
)
−
𝛼
𝑇
∗
𝐻
(
𝜋
𝑇
∗
)
)
	
; should s.t. 
𝐻
(
𝜋
𝑇
−
1
)
−
𝐻
0
≥
0

	
=
min
𝛼
𝑇
−
1
≥
0
max
𝜋
𝑇
−
1
(
𝑄
𝑇
−
1
∗
(
𝑠
𝑇
−
1
,
𝑎
𝑇
−
1
)
−
𝛼
𝑇
∗
𝐻
(
𝜋
𝑇
∗
)
+
𝛼
𝑇
−
1
(
𝐻
(
𝜋
𝑇
−
1
)
−
𝐻
0
)
)
	
; dual problem w/ Lagrangian.

	
=
min
𝛼
𝑇
−
1
≥
0
max
𝜋
𝑇
−
1
(
𝑄
𝑇
−
1
∗
(
𝑠
𝑇
−
1
,
𝑎
𝑇
−
1
)
+
𝛼
𝑇
−
1
𝐻
(
𝜋
𝑇
−
1
)
−
𝛼
𝑇
−
1
𝐻
0
)
−
𝛼
𝑇
∗
𝐻
(
𝜋
𝑇
∗
)

Similar to the previous step,

	



	

𝜋
𝑇
−
1
∗
	
=
arg
⁡
max
𝜋
𝑇
−
1
𝐸
(
𝑠
𝑇
−
1
,
𝑎
𝑇
−
1
)
∼
𝜌
𝜋
[
𝑄
𝑇
−
1
∗
(
𝑠
𝑇
−
1
,
𝑎
𝑇
−
1
)
+
𝛼
𝑇
−
1
𝐻
(
𝜋
𝑇
−
1
)
−
𝛼
𝑇
−
1
𝐻
0
]


𝛼
𝑇
−
1
∗
	
=
arg
⁡
min
𝛼
𝑇
−
1
≥
0
𝐸
(
𝑠
𝑇
−
1
,
𝑎
𝑇
−
1
)
∼
𝜌
𝜋
∗
[
𝛼
𝑇
−
1
𝐻
(
𝜋
𝑇
−
1
∗
)
−
𝛼
𝑇
−
1
𝐻
0
]

The equation for updating 
𝛼
𝑇
−
1
 in green has the same format as the equation for updating 
𝛼
𝑇
−
1
 in blue above. By repeating this process, we can learn the optimal temperature parameter in every step by minimizing the same objective function:

𝐽
(
𝛼
)
=
𝐸
𝑎
𝑡
∼
𝜋
𝑡
[
−
𝛼
log
⁡
𝜋
𝑡
(
𝑎
𝑡
∣
𝑠
𝑡
)
−
𝛼
𝐻
0
]

The final algorithm is same as SAC except for learning 
𝛼
 explicitly with respect to the objective 
𝐽
(
𝛼
)
 (see Fig. 7):

The soft actor-critic algorithm with automatically adjusted temperature. (Image source: original paper)
TD3

[paper|code]

The Q-learning algorithm is commonly known to suffer from the overestimation of the value function. This overestimation can propagate through the training iterations and negatively affect the policy. This property directly motivated Double Q-learning and Double DQN: the action selection and Q-value update are decoupled by using two value networks.

Twin Delayed Deep Deterministic (short for TD3; Fujimoto et al., 2018) applied a couple of tricks on DDPG to prevent the overestimation of the value function:

(1) Clipped Double Q-learning: In Double Q-Learning, the action selection and Q-value estimation are made by two networks separately. In the DDPG setting, given two deterministic actors 
(
𝜇
𝜃
1
,
𝜇
𝜃
2
)
 with two corresponding critics 
(
𝑄
𝑤
1
,
𝑄
𝑤
2
)
, the Double Q-learning Bellman targets look like:

	
	
𝑦
1
	
=
𝑟
+
𝛾
𝑄
𝑤
2
(
𝑠
′
,
𝜇
𝜃
1
(
𝑠
′
)
)


𝑦
2
	
=
𝑟
+
𝛾
𝑄
𝑤
1
(
𝑠
′
,
𝜇
𝜃
2
(
𝑠
′
)
)

However, due to the slow changing policy, these two networks could be too similar to make independent decisions. The Clipped Double Q-learning instead uses the minimum estimation among two so as to favor underestimation bias which is hard to propagate through training:

	

	

𝑦
1
	
=
𝑟
+
𝛾
min
𝑖
=
1
,
2
𝑄
𝑤
𝑖
(
𝑠
′
,
𝜇
𝜃
1
(
𝑠
′
)
)


𝑦
2
	
=
𝑟
+
𝛾
min
𝑖
=
1
,
2
𝑄
𝑤
𝑖
(
𝑠
′
,
𝜇
𝜃
2
(
𝑠
′
)
)

(2) Delayed update of Target and Policy Networks: In the actor-critic model, policy and value updates are deeply coupled: Value estimates diverge through overestimation when the policy is poor, and the policy will become poor if the value estimate itself is inaccurate.

To reduce the variance, TD3 updates the policy at a lower frequency than the Q-function. The policy network stays the same until the value error is small enough after several updates. The idea is similar to how the periodically-updated target network stay as a stable objective in DQN.

(3) Target Policy Smoothing: Given a concern with deterministic policies that they can overfit to narrow peaks in the value function, TD3 introduced a smoothing regularization strategy on the value function: adding a small amount of clipped random noises to the selected action and averaging over mini-batches.

		
		
𝑦
	
=
𝑟
+
𝛾
𝑄
𝑤
(
𝑠
′
,
𝜇
𝜃
(
𝑠
′
)
+
𝜖
)
	

𝜖
	
∼
clip
(
𝑁
(
0
,
𝜎
)
,
−
𝑐
,
+
𝑐
)
	
 ; clipped random noises.

This approach mimics the idea of SARSA update and enforces that similar actions should have similar values.

Here is the final algorithm:

TD3 Algorithm. (Image source: Fujimoto et al., 2018)
SVPG

[paper|code for SVPG]

Stein Variational Policy Gradient (SVPG; Liu et al, 2017) applies the Stein variational gradient descent (SVGD; Liu and Wang, 2016) algorithm to update the policy parameter 
𝜃
.

In the setup of maximum entropy policy optimization, 
𝜃
 is considered as a random variable 
𝜃
∼
𝑞
(
𝜃
)
 and the model is expected to learn this distribution 
𝑞
(
𝜃
)
. Assuming we know a prior on how 
𝑞
 might look like, 
𝑞
0
, and we would like to guide the learning process to not make 
𝜃
 too far away from 
𝑞
0
 by optimizing the following objective function:

𝐽
^
(
𝜃
)
=
𝐸
𝜃
∼
𝑞
[
𝐽
(
𝜃
)
]
−
𝛼
𝐷
KL
(
𝑞
‖
𝑞
0
)

where 
𝐸
𝜃
∼
𝑞
[
𝑅
(
𝜃
)
]
 is the expected reward when 
𝜃
∼
𝑞
(
𝜃
)
 and 
𝐷
KL
 is the KL divergence.

If we don’t have any prior information, we might set 
𝑞
0
 as a uniform distribution and set 
𝑞
0
(
𝜃
)
 to a constant. Then the above objective function becomes SAC, where the entropy term encourages exploration:

	
	
	
𝐽
^
(
𝜃
)
	
=
𝐸
𝜃
∼
𝑞
[
𝐽
(
𝜃
)
]
−
𝛼
𝐷
KL
(
𝑞
‖
𝑞
0
)

	
=
𝐸
𝜃
∼
𝑞
[
𝐽
(
𝜃
)
]
−
𝛼
𝐸
𝜃
∼
𝑞
[
log
⁡
𝑞
(
𝜃
)
−
log
⁡
𝑞
0
(
𝜃
)
]

	
=
𝐸
𝜃
∼
𝑞
[
𝐽
(
𝜃
)
]
+
𝛼
𝐻
(
𝑞
(
𝜃
)
)

Let’s take the derivative of 
𝐽
^
(
𝜃
)
=
𝐸
𝜃
∼
𝑞
[
𝐽
(
𝜃
)
]
−
𝛼
𝐷
KL
(
𝑞
|
𝑞
0
)
 w.r.t. 
𝑞
:

	
	
	
	
∇
𝑞
𝐽
^
(
𝜃
)
	
=
∇
𝑞
(
𝐸
𝜃
∼
𝑞
[
𝐽
(
𝜃
)
]
−
𝛼
𝐷
KL
(
𝑞
‖
𝑞
0
)
)

	
=
∇
𝑞
∫
𝜃
(
𝑞
(
𝜃
)
𝐽
(
𝜃
)
−
𝛼
𝑞
(
𝜃
)
log
⁡
𝑞
(
𝜃
)
+
𝛼
𝑞
(
𝜃
)
log
⁡
𝑞
0
(
𝜃
)
)

	
=
∫
𝜃
(
𝐽
(
𝜃
)
−
𝛼
log
⁡
𝑞
(
𝜃
)
−
𝛼
+
𝛼
log
⁡
𝑞
0
(
𝜃
)
)

	
=
0

The optimal distribution is:


				

				

				

log
⁡
𝑞
∗
(
𝜃
)
=
1
𝛼
𝐽
(
𝜃
)
+
log
⁡
𝑞
0
(
𝜃
)
−
1
 thus 
𝑞
∗
(
𝜃
)
⏟
"posterior"
∝
exp
⁡
(
𝐽
(
𝜃
)
/
𝛼
)
⏟
"likelihood"
𝑞
0
(
𝜃
)
⏟
prior

The temperature 
𝛼
 decides a tradeoff between exploitation and exploration. When 
𝛼
→
0
, 
𝜃
 is updated only according to the expected return 
𝐽
(
𝜃
)
. When 
𝛼
→
∞
, 
𝜃
 always follows the prior belief.

When using the SVGD method to estimate the target posterior distribution 
𝑞
(
𝜃
)
, it relies on a set of particle 
{
𝜃
𝑖
}
𝑖
=
1
𝑛
 (independently trained policy agents) and each is updated:



𝜃
𝑖
←
𝜃
𝑖
+
𝜖
𝜙
∗
(
𝜃
𝑖
)
 where 
𝜙
∗
=
max
𝜙
∈
𝐻
{
−
∇
𝜖
𝐷
KL
(
𝑞
[
𝜃
+
𝜖
𝜙
(
𝜃
)
]
′
‖
𝑞
)
 s.t. 
‖
𝜙
‖
𝐻
≤
1
}

where 
𝜖
 is a learning rate and 
𝜙
∗
 is the unit ball of a RKHS (reproducing kernel Hilbert space) 
𝐻
 of 
𝜃
-shaped value vectors that maximally decreases the KL divergence between the particles and the target distribution. 
𝑞
′
(
.
)
 is the distribution of 
𝜃
+
𝜖
𝜙
(
𝜃
)
.

Comparing different gradient-based update methods:

Method	Update space
Plain gradient	
Δ
𝜃
 on the parameter space
Natural gradient	
Δ
𝜃
 on the search distribution space
SVGD	
Δ
𝜃
 on the kernel function space (edited)

One estimation of 
𝜙
∗
 has the following form. A positive definite kernel 
𝑘
(
𝜗
,
𝜃
)
, i.e. a Gaussian radial basis function, measures the similarity between particles.

		
	


	
𝜙
∗
(
𝜃
𝑖
)
	
=
𝐸
𝜗
∼
𝑞
′
[
∇
𝜗
log
⁡
𝑞
(
𝜗
)
𝑘
(
𝜗
,
𝜃
𝑖
)
+
∇
𝜗
𝑘
(
𝜗
,
𝜃
𝑖
)
]

	
=
1
𝑛
∑
𝑗
=
1
𝑛
[
∇
𝜃
𝑗
log
⁡
𝑞
(
𝜃
𝑗
)
𝑘
(
𝜃
𝑗
,
𝜃
𝑖
)
+
∇
𝜃
𝑗
𝑘
(
𝜃
𝑗
,
𝜃
𝑖
)
]
	
;approximate 
𝑞
′
 with current particle values
The first term in red encourages 
𝜃
𝑖
 learning towards the high probability regions of 
𝑞
 that is shared across similar particles. => to be similar to other particles
The second term in green pushes particles away from each other and therefore diversifies the policy. => to be dissimilar to other particles

Usually the temperature 
𝛼
 follows an annealing scheme so that the training process does more exploration at the beginning but more exploitation at a later stage.

IMPALA

[paper|code]

In order to scale up RL training to achieve a very high throughput, IMPALA (“Importance Weighted Actor-Learner Architecture”) framework decouples acting from learning on top of basic actor-critic setup and learns from all experience trajectories with V-trace off-policy correction.

Multiple actors generate experience in parallel, while the learner optimizes both policy and value function parameters using all the generated experience. Actors update their parameters with the latest policy from the learner periodically. Because acting and learning are decoupled, we can add many more actor machines to generate a lot more trajectories per time unit. As the training policy and the behavior policy are not totally synchronized, there is a gap between them and thus we need off-policy corrections.

Let the value function 
𝑉
𝜃
 parameterized by 
𝜃
 and the policy 
𝜋
𝜙
 parameterized by 
𝜙
. Also we know the trajectories in the replay buffer are collected by a slightly older policy 
𝜇
.

At the training time 
𝑡
, given 
(
𝑠
𝑡
,
𝑎
𝑡
,
𝑠
𝑡
+
1
,
𝑟
𝑡
)
, the value function parameter 
𝜃
 is learned through an L2 loss between the current value and a V-trace value target. The 
𝑛
-step V-trace target is defined as:

	





	




𝑣
𝑡
	
=
𝑉
𝜃
(
𝑠
𝑡
)
+
∑
𝑖
=
𝑡
𝑡
+
𝑛
−
1
𝛾
𝑖
−
𝑡
(
∏
𝑗
=
𝑡
𝑖
−
1
𝑐
𝑗
)
𝛿
𝑖
𝑉

	
=
𝑉
𝜃
(
𝑠
𝑡
)
+
∑
𝑖
=
𝑡
𝑡
+
𝑛
−
1
𝛾
𝑖
−
𝑡
(
∏
𝑗
=
𝑡
𝑖
−
1
𝑐
𝑗
)
𝜌
𝑖
(
𝑟
𝑖
+
𝛾
𝑉
𝜃
(
𝑠
𝑖
+
1
)
−
𝑉
𝜃
(
𝑠
𝑖
)
)

where the red part 
𝛿
𝑖
𝑉
 is a temporal difference for 
𝑉
. 
𝜌
𝑖
=
min
(
𝜌
¯
,
𝜋
(
𝑎
𝑖
|
𝑠
𝑖
)
𝜇
(
𝑎
𝑖
|
𝑠
𝑖
)
)
 and 
𝑐
𝑗
=
min
(
𝑐
¯
,
𝜋
(
𝑎
𝑗
|
𝑠
𝑗
)
𝜇
(
𝑎
𝑗
|
𝑠
𝑗
)
)
 are truncated importance sampling (IS) weights. The product of 
𝑐
𝑡
,
…
,
𝑐
𝑖
−
1
 measures how much a temporal difference 
𝛿
𝑖
𝑉
 observed at time 
𝑖
 impacts the update of the value function at a previous time 
𝑡
. In the on-policy case, we have 
𝜌
𝑖
=
1
 and 
𝑐
𝑗
=
1
 (assuming 
𝑐
¯
≥
1
) and therefore the V-trace target becomes on-policy 
𝑛
-step Bellman target.

𝜌
¯
 and 
𝑐
¯
 are two truncation constants with 
𝜌
¯
≥
𝑐
¯
. 
𝜌
¯
 impacts the fixed-point of the value function we converge to and 
𝑐
¯
 impacts the speed of convergence. When 
𝜌
¯
=
∞
 (untruncated), we converge to the value function of the target policy 
𝑉
𝜋
; when 
𝜌
¯
 is close to 0, we evaluate the value function of the behavior policy 
𝑉
𝜇
; when in-between, we evaluate a policy between 
𝜋
 and 
𝜇
.

The value function parameter is therefore updated in the direction of:

Δ
𝜃
=
(
𝑣
𝑡
−
𝑉
𝜃
(
𝑠
𝑡
)
)
∇
𝜃
𝑉
𝜃
(
𝑠
𝑡
)

The policy parameter 
𝜙
 is updated through policy gradient,

	
	

Δ
𝜙
	
=
𝜌
𝑡
∇
𝜙
log
⁡
𝜋
𝜙
(
𝑎
𝑡
|
𝑠
𝑡
)
(
𝑟
𝑡
+
𝛾
𝑣
𝑡
+
1
−
𝑉
𝜃
(
𝑠
𝑡
)
)
+
∇
𝜙
𝐻
(
𝜋
𝜙
)

	
=
𝜌
𝑡
∇
𝜙
log
⁡
𝜋
𝜙
(
𝑎
𝑡
|
𝑠
𝑡
)
(
𝑟
𝑡
+
𝛾
𝑣
𝑡
+
1
−
𝑉
𝜃
(
𝑠
𝑡
)
)
−
∇
𝜙
∑
𝑎
𝜋
𝜙
(
𝑎
|
𝑠
𝑡
)
log
⁡
𝜋
𝜙
(
𝑎
|
𝑠
𝑡
)

where 
𝑟
𝑡
+
𝛾
𝑣
𝑡
+
1
 is the estimated Q value, from which a state-dependent baseline 
𝑉
𝜃
(
𝑠
𝑡
)
 is subtracted. 
𝐻
(
𝜋
𝜙
)
 is an entropy bonus to encourage exploration.

In the experiments, IMPALA is used to train one agent over multiple tasks. Two different model architectures are involved, a shallow model (left) and a deep residual model (right).

Quick Summary

After reading through all the algorithms above, I list a few building blocks or principles that seem to be common among them:

Try to reduce the variance and keep the bias unchanged to stabilize learning.
Off-policy gives us better exploration and helps us use data samples more efficiently.
Experience replay (training data sampled from a replay memory buffer);
Target network that is either frozen periodically or updated slower than the actively learned policy network;
Batch normalization;
Entropy-regularized reward;
The critic and actor can share lower layer parameters of the network and two output heads for policy and value functions.
It is possible to learn with deterministic policy rather than stochastic one.
Put constraint on the divergence between policy updates.
New optimization methods (such as K-FAC).
Entropy maximization of the policy helps encourage exploration.
Try not to overestimate the value function.
Think twice whether the policy and value network should share parameters.
TBA more.

Cited as:

@article{weng2018PG,
  title   = "Policy Gradient Algorithms",
  author  = "Weng, Lilian",
  journal = "lilianweng.github.io",
  year    = "2018",
  url     = "https://lilianweng.github.io/posts/2018-04-08-policy-gradient/"
}

References

[1] jeremykun.com Markov Chain Monte Carlo Without all the Bullshit

[2] Richard S. Sutton and Andrew G. Barto. Reinforcement Learning: An Introduction; 2nd Edition. 2017.

[3] John Schulman, et al. “High-dimensional continuous control using generalized advantage estimation.” ICLR 2016.

[4] Thomas Degris, Martha White, and Richard S. Sutton. “Off-policy actor-critic.” ICML 2012.

[5] timvieira.github.io Importance sampling

[6] Mnih, Volodymyr, et al. “Asynchronous methods for deep reinforcement learning.” ICML. 2016.

[7] David Silver, et al. “Deterministic policy gradient algorithms.” ICML. 2014.

[8] Timothy P. Lillicrap, et al. “Continuous control with deep reinforcement learning.” arXiv preprint arXiv:1509.02971 (2015).

[9] Ryan Lowe, et al. “Multi-agent actor-critic for mixed cooperative-competitive environments.” NIPS. 2017.

[10] John Schulman, et al. “Trust region policy optimization.” ICML. 2015.

[11] Ziyu Wang, et al. “Sample efficient actor-critic with experience replay.” ICLR 2017.

[12] Rémi Munos, Tom Stepleton, Anna Harutyunyan, and Marc Bellemare. “Safe and efficient off-policy reinforcement learning” NIPS. 2016.

[13] Yuhuai Wu, et al. “Scalable trust-region method for deep reinforcement learning using Kronecker-factored approximation.” NIPS. 2017.

[14] kvfrans.com A intuitive explanation of natural gradient descent

[15] Sham Kakade. “A Natural Policy Gradient.”. NIPS. 2002.

[16] “Going Deeper Into Reinforcement Learning: Fundamentals of Policy Gradients.” - Seita’s Place, Mar 2017.

[17] “Notes on the Generalized Advantage Estimation Paper.” - Seita’s Place, Apr, 2017.

[18] Gabriel Barth-Maron, et al. “Distributed Distributional Deterministic Policy Gradients.” ICLR 2018 poster.

[19] Tuomas Haarnoja, Aurick Zhou, Pieter Abbeel, and Sergey Levine. “Soft Actor-Critic: Off-Policy Maximum Entropy Deep Reinforcement Learning with a Stochastic Actor.” arXiv preprint arXiv:1801.01290 (2018).

[20] Scott Fujimoto, Herke van Hoof, and Dave Meger. “Addressing Function Approximation Error in Actor-Critic Methods.” arXiv preprint arXiv:1802.09477 (2018).

[21] Tuomas Haarnoja, et al. “Soft Actor-Critic Algorithms and Applications.” arXiv preprint arXiv:1812.05905 (2018).

[22] David Knowles. “Lagrangian Duality for Dummies” Nov 13, 2010.

[23] Yang Liu, et al. “Stein variational policy gradient.” arXiv preprint arXiv:1704.02399 (2017).

[24] Qiang Liu and Dilin Wang. “Stein variational gradient descent: A general purpose bayesian inference algorithm.” NIPS. 2016.

[25] Lasse Espeholt, et al. “IMPALA: Scalable Distributed Deep-RL with Importance Weighted Actor-Learner Architectures” arXiv preprint 1802.01561 (2018).

[26] Karl Cobbe, et al. “Phasic Policy Gradient.” arXiv preprint arXiv:2009.04416 (2020).

[27] Chloe Ching-Yun Hsu, et al. “Revisiting Design Choices in Proximal Policy Optimization.” arXiv preprint arXiv:2009.10897 (2020).

Reinforcement-Learning
 
Long-Read
 
Math-Heavy
«
Implementing Deep Reinforcement Learning Models with Tensorflow + OpenAI Gym
»
A (Long) Peek into Reinforcement Learning
© 2025 Lil'Log Powered by Hugo & PaperMod