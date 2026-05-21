# Exercises Reinforcement Learning: An Introduction (2 nd Edition) 

## Scott Jeen April 30, 2021 

# Contents 

1 Introduction 2

Exercise 1.1 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 2Exercise 1.2 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 2Exercise 1.3 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 2Exercise 1.4 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 2Exercise 1.5 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 3

2 Multi-arm Bandits 4

Exercise 2.1 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 4Exercise 2.2 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 4Exercise 2.3 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 4Exercise 2.4 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 5Exercise 2.5 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 5Exercise 2.6 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 5Exercise 2.7 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 7Exercise 2.8 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 7Exercise 2.9 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 7Exercise 2.10 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 8

3 Finite Markov Decision Processes 9

Exercise 3.1 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 9Exercise 3.2 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 9Exercise 3.3 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 10 Exercise 3.4 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 10 Exercise 3.5 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 10 Exercise 3.6 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 11 Exercise 3.7 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 11 Exercise 3.8 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 12 Exercise 3.9 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 12 Exercise 3.10 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 12 Exercise 3.11 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 13 Exercise 3.12 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 13 Exercise 3.13 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 13 Exercise 3.14 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 14 Exercise 3.15 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 14 Exercise 3.16 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 15 Exercise 3.17 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 15 1Exercise 3.18 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 16 Exercise 3.19 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 16 Exercise 3.20 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 17 Exercise 3.21 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 18 Exercise 3.22 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 18 Exercise 3.23 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 19 Exercise 3.24 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 19 Exercise 3.25 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 20 Exercise 3.26 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 20 Exercise 3.27 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 20 Exercise 3.28 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 20 Exercise 3.29 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 20 

5 Monte Carlo Methods 26 

Exercise 5.1 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 26 Exercise 5.2 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 26 Exercise 5.3 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 26 Exercise 5.4 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 27 Exercise 5.5 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 27 Exercise 5.6 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 27 Exercise 5.7 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 28 Exercise 5.8 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 28 Exercise 5.9 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 28 Exercise 5.10 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 29 Exercise 5.11 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 29 Exercise 5.12 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 30 Exercise 5.13 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 30 Exercise 5.14 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 30 

6 Temporal-Difference Learning 31 

Exercise 6.1 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 31 Exercise 6.2 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 31 Exercise 6.3 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 32 Exercise 6.4 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 32 Exercise 6.5 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 33 Exercise 6.6 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 33 Exercise 6.7 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 33 Exercise 6.8 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 34 Exercise 6.9 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 34 Exercise 6.10 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 35 Exercise 6.11 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 35 Exercise 6.12 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 36 Exercise 6.13 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 36 Exercise 6.14 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 36 

7 n-step Bootstrapping 38 

Exercise 7.1 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 38 Exercise 7.2 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 38 Exercise 7.3 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 38 Exercise 7.4 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 39 Exercise 7.5 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 40 Exercise 7.6 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 41 2Exercise 7.7 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 41 Exercise 7.8 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 41 Exercise 7.9 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 42 Exercise 7.10 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 42 Exercise 7.11 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 42 

8 Planning and Learning with Tabular Methods 44 

Exercise 8.1 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 44 Exercise 8.2 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 44 Exercise 8.3 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 44 Exercise 8.4 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 45 Exercise 8.5 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 46 Exercise 8.6 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 47 Exercise 8.7 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 47 

9 On-policy Control with Approximation 48 

Exercise 10.1 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 48 Exercise 10.2 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 48 Exercise 10.3 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 48 Exercise 10.4 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 48 Exercise 10.5 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 49 Exercise 10.6 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 50 Exercise 10.7 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 51 Exercise 10.8 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 52 Exercise 10.9 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 52 31 Introduction 

## Exercise 1.1 

Q

Suppose, instead of playing against a random opponent, the reinforcement learning algorithm described above played against itself, with both sides learning. What do you think would happen in this case? Would it learn a different policy for selecting moves? 

A

skipped 

## Exercise 1.2 

Q

Many tic-tac-toe positions appear different but are really the same because of symmetries. How might we amend the learning process described above to take advantage of this? In what ways would this change improve the learning process? Now think again. Suppose the opponent did not take advantage of symmetries. In that case, should we? Is it true, then, that symmetrically equivalent positions should necessarily have the same value? 

A

skipped 

## Exercise 1.3 

Q

Suppose the reinforcement learning player was greedy, that is, it always played the move that brought it to the position that it rated the best. Might it learn to play better, or worse, than a nongreedy player? What problems might occur? 

A

skipped 

## Exercise 1.4 

Q

Suppose learning updates occurred after all moves, including exploratory moves. If the step-size parameter is appropriately reduced over time (but not the tendency to explore), then the state values would converge to a different set of probabilities. What (conceptually) are the two sets of probabilities computed when we do, and when we do not, learn from exploratory moves? Assuming that we do continue to make exploratory moves, which set of probabilities might be better to learn? Which would result in more wins? 

A

skipped 

4Exercise 1.5 

Q

Can you think of other ways to improve the reinforcement learning player? Can you think of any better way to solve the tic-tac-toe problem as posed? 

A

skipped 

52 Multi-arm Bandits 

## Exercise 2.1 

Q

In e-greedy action selection, for the case of two actions and e = 0.5, what is the probability that the greedy action is selected? 

A

Greedy action selected with p = 0.5 

## Exercise 2.2 

Q

Bandit example Consider a k-armed bandit problem with k = 4 actions, denoted 1, 2, 3, and 4. Consider applying to this problem a bandit algorithm using e-greedy action selection, sample-average action-value estimates, and initial estimates of Q1(a) = 0, for all a. Suppose the initial sequence of actions and rewards is A1 = 1 , R 1 = 1 , A 2 = 2 , R 2 = 1 , A 3 = 2 , R 3 = 2 , A 4 =2, R 4 = 2 , A 5 = 3 , R 5 = 0. On some of these time steps the e case may have occurred, causing an action to be selected at random. On which time steps did this definitely occur? On which time steps could this possibly have occurred? 

A

Timestep Q1 Q2 Q3 Q4 Greedy action at timestep Action selected 0 0 0 0 0 - A1

1 1 0 0 0 A1 A2

2 1 1 0 0 A1/A 2 A2

3 1 1.5 0 0 A2 A2

4 1 1.66 0 0 A2 A5

5 1 1.66 0 0 A2 end 

> Table 1: Greedy actions at each timestep of a 4-armed bandit problem

• Action selection at timesteps 0, 1 and 4 are random as they are not reward maximising -see Table ?? .

• Action selection at timestep 2 could be random as A1 is also reward maximising - see Table ?? .



## Exercise 2.3 

Q

In the comparison shown in Figure ?? , which method will perform best in the long run in terms of cumulative reward and probability of selecting the best action? How much better will it be? Express your answer quantitatively. 6A

In the limit of t → ∞ , both non-zero e-greedy policies will learn the optimal action abd value function q∗. The policy with e = 0.01 will select the optimal action 10x more regularly than the policy with e = 0.1. 

## Exercise 2.4 

Q

If the step-size parameters, αn, are not constant, then the estimate Qn is a weighted average of previously received rewards with a weighting different from that given by (2.6). What is the weighting on each prior reward for the general case, analogous to (2.6), in terms of the sequence of step-size parameters?. 

A

For a n-dependent α we have: 

Qn+1 = Qn + αn [Rn − Qn]= αnRn + (1 − αn)Qn

= αnRn + (1 − αn) [ Qn−1 + αn−1 [Rn−1 − Qn−1]] = αnRn + αn−1Rn−1 − αnαn−1Rn−1 + (1 − αn)(1 − αn−1)Qn−1

= ...=

> n

∑

> i

αnRn − Rn−1

> n

∏

> i

αn + Q1

> n

∏

> i

(1 − αn) (1) (2) 



## Exercise 2.5 

Q

Design and conduct an experiment to demonstrate the difficulties that sample-average methods have for nonstationary problems. Use a modified version of the 10-armed testbed in which all the q∗(a) start out equal and then take independent random walks (say by adding a normally distributed increment with mean 0 and standard deviation 0.01 to all the q∗(a) on each step). Prepare plots like Figure 2.2 for an action-value method using sample averages, incrementally computed, and another action-value method using a constant step-size parameter, α = 0.1. Use 

α = 0.1 and longer runs, say of 10,000 steps. 

A

This is a programming exercise, the relevent code can be found on my GitHub. 

## Exercise 2.6 

Q

Mysterious Spikes : The results shown in Figure 2.3 should be quite reliable because they are averages over 2000 individual, randomly chosen 10-armed bandit tasks. Why, then, are there 7Figure 1: Stationary versus varying stepsize alpha in a 10-armed bandit problem. We see that the constant stepsize parameter (exponential decay) performs better than the varying stepsize parameter as we place more weight on the recently observed (moving) values. 

> Figure 2

oscillations and spikes in the early part of the curve for the optimistic method? In other words, what might make this method perform particularly better or worse, on average, on particular early steps? 

A

The optimistic greedy policy with explore on every initial step as all value estimates are greater than their true value. It is possible, therefore, that it randomly selects the optimal action and then immediately forgets it in favour of yet-to-be-explored actions. This explains the spike at timestep ≈ 10. 

8Exercise 2.7 

Q

Unbiased Constant-Step-Size Trick In most of this chapter we have used sample averages to estimate action values because sample averages do not produce the initial bias that constant step sizes do (see the analysis leading to (2.6)). However, sample averages are not a completely satisfactory solution because they may perform poorly on nonstationary problems. Is it possi-ble to avoid the bias of constant step sizes while retaining their advantages on nonstationary problems? One way is to use a step size of 

βn = α/ ¯on (3) to process the nth reward for a particular action, where α ¿ 0 is a conventional constant step size, and ¯on is a trace of one that starts at 0: ¯on = ¯on−1 + α(1 − ¯on−1), f orn > 0and ¯o0 = 0 . (4) Carry out an analysis like that in (2.6) to show that Qn is an exponential recency-weighted average without initial bias. 

A

If we recall our answer for Exercise 2.4 for varying stepsize, we see that Q1 is weighted by 

w = ∏∞

> i=1

(1 − αi). When i = 1, βn = α, thus w → 0∀i and Q1 no longer affects our estimate of Qn+1 . 

## Exercise 2.8 

Q

UCB Spikes In Figure ?? the UCB algorithm shows a distinct spike in performance on the 11th step. Why is this? Note that for your answer to be fully satisfactory it must explain both why the reward increases on the 11th step and why it decreases on the subsequent steps. Hint: If c = 1, then the spike is less prominent. 

A

After 10 timesteps the UCB algorithm has explored all 10 actions as, until they are selected, their upper confidence bound is infinite (as Nt(a) = 0) as so it guarenteed to be selected once in the first 10 actions. At this point the agent has one sample to assess the expected value of each arm and the same confidence/uncertainty in each action. With c ¡ 0 it is likely to pick the action with highest return from first sample, which will likely give it an similarly large reward, creating the spike. Now, the upper confidence bound for that action will decrease and the agent will select another, less valuable action, causing the decrease in performance at the next timestep. 



## Exercise 2.9 

Q

Show that in the case of two actions, the soft-max distribution is the same as that given by the logistic, or sigmoid, function often used in statistics and artificial neural networks. 9A

Soft-max distribution is defined as: 

P rA t = a ≈ eHt(a)

∑kb=1 eHt(b) ≈ πt(a) (5) For two actions 1 and 2 this becomes: 

At = eHt(1) 

eHt(1)+ eHt(2) (6) = eHt(1) 

eHt(1) (1 + eHt(2) 

eHt(1) (7) = 1

eHt(1) (1 + e−x (8) (9) i.e. the sigmoid function with x = Ht(1) − Ht(2). 

## Exercise 2.10 

Q

Suppose you face a 2-armed bandit task whose true action values change randomly from time step to time step. Specifically, suppose that, for any time step, the true values of actions 1 and 2 are respectively 10 and 20 with probability 0.5 (case A), and 90 and 80 with probability 0.5 (case B). If you are not able to tell which case you face at any step, what is the best expected reward you can achieve and how should you behave to achieve it? Now suppose that on each step you are told whether you are facing case A or case B (although you still don’t know the true action values). This is an associative search task. What is the best expected reward you can achieve in this task, and how should you behave to achieve it? 

A

Part 1): If we do not know whether we are in task A or B we could decide pick the same action each time to maximise expected reward. Selecting either action 1 or action 2 every time would provide an expected reward of 50. Picking actions randomly would also provide an expected reward of 50 in this example. Part 2): If we know we are in task A or B we can learn the optimal action for each (A(a) = 2 and B(a) = 1). Doing so would provide us a higher expected reward than the non-contextual case of 55. 

10 3 Finite Markov Decision Processes 

## Exercise 3.1 

Q

Devise three example tasks of your own that fit into the MDP framework, identifying for each its states, actions, and rewards. Make the three examples as different from each other as possible. The framework is abstract and flexible and can be applied in many different ways. Stretch its limits in some way in at least one of your examples. 

A

1. Golf: Putting 

• State: Coordinates of ball; coordinates of hole; x,y,z contour plot of green; grass length; grass type; wind speed; wind direction; ball type; putter type. 

• Actions: (X, Y) direction of aim; length of stroke 

• Rewards: -1 for each unit of distance from hole 2. Optimizing investment portfolio 

• State: Investment in each company; cash balance; % return over last minute/hour/day/week/month/year 

• Actions: For each investment: buy (discretized by some cash interval), sell (dis-cretized by some cash interval), stick 

• Rewards: +1 for each £ return per day 3. Shoe-tying robot 

• State: Coordinates of laces; coordinates of robot arms/joints 

• Actions: Grip pressure on laces; adjust position of arms to coordinates x,y,z 

• Rewards: -1 for unit of shoe displacement from foot once tied. 



## Exercise 3.2 

Q

Is the MDP framework adequate to usefully represent all goal-directed learning tasks? Can you think of any clear exceptions? 

A

The MDP framework fails when the state cannot be fully observed. For example, one may try to control the temperature of a house using a state space represented by one thermometer in one room. Our agent would control the temperature observed by that thermometer well, but would be blind to temperatures that aren’t measured by said thermometer elsewhere in the house. 

11 s a s′ r p( s, r, |s, a )

high search high rsearch αhigh search low rsearch (1 − α)

low search high -3 (1 − β)

low search low rsearch βhigh wait high rwait 1

low wait low rwait 1

low recharge high 0 1

## Exercise 3.3 

Q

Consider the problem of driving. You could define the actions in terms of the accelerator, steering wheel, and brake, that is, where your body meets the machine. Or you could define them farther out—say, where the rubber meets the road, considering your actions to be tire torques. Or you could define them farther in—say, where your brain meets your body, the actions being muscle twitches to control your limbs. Or you could go to a really high level and say that your actions are your choices of where to drive. What is the right level, the right place to draw the line between agent and environment? On what basis is one location of the line to be preferred over another? Is there any fundamental reason for preferring one location over another, or is it a free choice? 

A

There’s a trade-off between state-action space complexity, computational expense and accuracy. If we draw the boundary at the brain we would create a state-action space contingent on the number of neurons in the brain and their interplay with physical actions like turning the steering wheel; too large to be stored or computed efficiently. Equally, if we draw the boundary at the 

journey level, then we miss the detail required to act on second-by-second state changes on the road that could lead to a crash. The fundamental limiting factor in this selection is whether the goal can be achieved safely at your chosen layer of abstraction, indeed this feels like one of the tasks of engineering more widely. 

## Exercise 3.4 

Q

Give a table analogous to that in Example 3.3, but for p(s0, r |s, a ). It should have columns for 

s, a, s ′, r, and p(s0, r |s, a ), and a row for every 4-tuple for which p(s0, r |s, a ) > 0. 

A

As there is no probability distribution over the rewards (i.e. for each state-action pair, the agent receives some reward with p(r) = 1)), p(s′, r |s, a ) = p(s′|s, a ). 

## Exercise 3.5 

Q

The equations in Section 3.1 are for the continuing case and need to be modified (very slightly) to apply to episodic tasks. Show that you know the modifications needed by giving the modified version of (3.3). 12 A

Equation 3.3 from section 3.1 is: 

∑

> s′∈S

∑

> r∈R

p(s′, r |s, a ) = 1 , ∀s ∈ S, a ∈ A(s) (10) for episodic tasks this becomes: 

∑

> s′∈S+

∑

> r∈R

p(s′, r |s, a ) = 1 , ∀s ∈ S, a ∈ A(s) (11) 



## Exercise 3.6 

Q

Suppose you treated pole-balancing as an episodic task but also used discounting, with all rewards zero except for 1 upon failure. What then would the return be at each time? How does this return differ from that in the discounted, continuing formulation of this task? 

A

In the discounted, episodic version of the pole-balancing task, the return after each episode is: 

Gt = −γT −t (12) where T is the timestep at which the episode ends i.e. the task is failed. In the continuining case the cumulative return is: 

Gt = − ∑

> K∈K

γK−1 (13) where K is the set of times where the task is failed. Note this reward will increase in the long run, irrespective of improved performance. Designing this as a continuous task does not therefore make sense here. 

## Exercise 3.7 

Q

Imagine that you are designing a robot to run a maze. You decide to give it a reward of +1 for escaping from the maze and a reward of zero at all other times. The task seems to break down naturally into episodes—the successive runs through the maze—so you decide to treat it as an episodic task, where the goal is to maximize expected total reward (3.7). After running the learning agent for a while, you find that it is showing no improvement in escaping from the maze. What is going wrong? Have you effectively communicated to the agent what you want it to achieve? 

A

We have designed the reward such that it receives +1 only once it has exited the maze, and are therefore not incentivising it to learn how to exit the maze faster. To do so, we would need to provide a negative reward proportional to time in the maze e.g. -1 per timestep. 

13 Exercise 3.8 

Q

Suppose γ = 0.5 and the following sequence of rewards is received R1 = -1, R2 = 2, R3 = 6, R4 = 3, and R5 = 2, with T = 5. What are G0, G 1, . . . , G 5? Hint: Work backwards. 

A

We know: Gt = Rt+1 +γG t+1 Therefore, for the terminal state: G5 = 0 then: G4 = 2+(0 .5×0) = 2G3 = 3 + (0 .5 × 2) = 4 G2 = 6 + (0 .5 × 4) = 8 G1 = 2 + (0 .5 × 8) = 6 G0 = −1 + (0 .5 × 6) = 2 Note our expected cumulative reward Gt depends greatly on our instant reward Gt+1 because it is not discounted. 

## Exercise 3.9 

Q

Suppose γ = 0.9 and the reward sequence is R1 = 2 followed by an infinite sequence of 7s. What are G1 and G0?

A

We know that if the reward is an infinite series of 1s, Gt is: Gt = ∑∞ 

> k=0

γk = 11−γ

So for an infinite series of 7s this becomes: Gt = ∑∞ 

> k=0

γk = 70.1

Therefore: 

G0 = 2 + 70.1 (14) = 72 (15) (16) and 

G1 = 7 + 70.1 (17) = 77 (18) (19) 



## Exercise 3.10 

Q

Prove the second equality in (3.10). 

A

Gt = ∑∞ 

> k=0

γk

Expanding out the geometric series we get: 

s = a + aγ + aγ 2 + . . . + aγ n (20) 

sγ = aγ + aγ 2 + aγ 3 + . . . + aγ n+1 (21) (22) 14 Subtract the first series from the second series and we get: 

s − sγ = a − aγ n+1 (23) 

s(1 − γ) = a(1 − γn+1 ) (24) 

s = a(1 − γn+1 )1 − γ (25) (26) If |γ| < 0, in the limit as n → ∞ we get: 

s = a

1 − γ (27) and in our special case a = 0 so: 

s = Gt = 11 − γ (28) 



## Exercise 3.11 

Q

If the current state is St, and actions are selected according to a stochastic policy π, then what is the expectation of Rt+1 in terms of π and the four-argument function p (3.2) 

A

Eπ [Rt+1 |st] = ∑ 

> a

π(a|s) ∑

> s′

∑ 

> r

p(s′, r |s, a )[ r] 

## Exercise 3.12 

Q

Give an equation for vπ in terms of qπ and π.

A

The state value function vπ is equal to the expected cumulative return from that state given a distribution of actions. The state-action value function qπ is the value of being in a state and taking a deterministic action. Therefore the state value function is the weighted sum of the state action value function, with the weights equal to the probabilities of selecting each action: 

vπ = ∑ 

> a

π(a|s)qπ (s, a ) 

## Exercise 3.13 

Q

Give an equation for qπ in terms of vπ and the four-argument p.

A

Given an action a, the state-action value function is the probability distributions over the possible next states and rewards from that action, times the one-step reward and the discounted state value function at the next timestep: qπ = ∑

> s′∈S

∑ 

> r∈R

p(s′, r |s, a )[ r + γv π (st+1 )] 

15 Figure 3: Gridworld example for ex. 3.14 

## Exercise 3.14 

Q

The Bellman equation (3.14) must hold for each state for the value function vπ shown in Figure 3.2 (right) of Example 3.5. Show numerically that this equation holds for the center state, valued at +0.7, with respect to its four neighbouring states, valued at +2.3, +0.4, 0.4, and +0.7. (These numbers are accurate only to one decimal place.) . 

A

Bellman equation for vπ is: 

vπ (s) = ∑

> a

π(a|s) ∑

> s′,r

p(s′, r |s, a )[ r + γv π (s′)] (29) for the centre square in Figure 3 we get the following: 

vπ (s) = 0 .25 [0 .9 × 2.3] + 0 .25 [0 .9 × 0.7] + 0 .25 [0 .9 × 0.4] + 0 .25 [0 .9 × − 0.4] (30) = 0 .68 ≈ 0.7 (31) (32) 



## Exercise 3.15 

Q

In the gridworld example, rewards are positive for goals, negative for running into the edge of the world, and zero the rest of the time. Are the signs of these rewards important, or only the intervals between them? Prove, using (3.8), that adding a constant c to all the rewards adds a constant, vc, to the values of all states, and thus does not affect the relative values of any states under any policies. What is vc in terms of c and γ?

A

Part 1): The sign of the reward is of no consequence, it is indeed the interval between each reward that drives behaviour. Part 2): Equation 3.8 is as follows: 

Gt =

> ∞

∑

> k=0

γkRt+k+1 (33) 16 when we add a constant c to all rewards this becomes: Gt = ∑∞ 

> k=0

γk[Rt+k+1 + c]Gt = Rt+k+1  

> 1−γ

+

> c
> 1−γ

Expected cumulative reward from every state receives a constant additive term. vc in terms of 

c and γ is: 

vc = E

[ ∞∑

> k=0

γkc

]

(34) = c

1 − γ (35) (36) 



## Exercise 3.16 

Q

Now consider adding a constant c to all the rewards in an episodic task, such as maze running. Would this have any effect, or would it leave the task unchanged as in the continuing task above? Why or why not? Give an example. 

A

In the episodic task adding a constant to all rewards does affect the agent. Since the cumulative reward now depends on the length of the episode ( Gt = ∑Tk=t+1 γk−t−1Rk), timesteps that incur positive rewards act to lengthen the episode and vice versa. In the maze running example, we may have chosen to give the agent -1 reward at each timestep to ensure it completes the task quickly. If we add c = 2 to every reward such that the reward at each timestep is now positive, the agent is now incentivised to not find the exit, and continue collecting intermediate rewards indefinitely. 

## Exercise 3.17  

> Figure 4: Backup diagram for qπ

Q

What is the Bellman equation for action values, that is, for qπ ? It must give the action value 

qπ (s, a ) in terms of the action values, qπ (s0, a 0), of possible successors to the state–action pair (s, a ). Hint: The backup diagram to the right corresponds to this equation. Show the sequence of equations analogous to (3.14), but for action values. 17 A

qπ (s, a ) = Eπ [Gt|St = s, A t = a] (37) = Eπ [Rt+1 + γG t+1 |St = s, A t = a] (38) = ∑

> s′,r

p(s′, r |s, a )[ r + γEπ [Gt+1 |s′, a ′]] (39) = ∑

> s′,r

p(s′, r |s, a )[ r + γq π (s′, a ′)] (40) (41) 



## Exercise 3.18 

Q

A

vπ (s) = Eπ [qπ (s, a )] vπ (s) = ∑

> a

π(a|s)qπ (s, a ) (42) 



## Exercise 3.19 

QA

qπ (s, a ) = E [Rt+1 + vπ (s′)|St = s)] (43) = ∑

> s′,r

p(s′, r |s, a )[ r + vπ (s′)] (44) (45) 



18 Exercise 3.20 

Q

> Figure 5: Value functions for golf.

Draw or describe the optimal state-value function for the golf example. 

A

Qualitatively, the optimal state-value function for golf (outlined by Figure ?? ) would be derived from a policy that selected the driver for the first two shots (off-the green), then selected the putter for the final shot (on the green). 

19 Exercise 3.21 

Q

Draw or describe the contours of the optimal action-value function for putting, q∗(s, putter ), for the golf example. 

A

The optimal action-value function is given by the following: 

q∗(s, a ) = ∑

> s′,r

p(s′, r |s, a )[ r + γ argmax 

> a

q∗(s, a )] (46) Since we have only one action( putter ), the argmax collapses to v∗(s′), and q∗(s, a ) = v∗(s) -illustrated in Figure ?? . 

## Exercise 3.22 

Q

A

Let’s first evaluate the simplest case of γ = 0. Recall that: 

vπ (s) = Eπ [Rt+1 + γG t+1 |St = s] (47) For πlef t we get: 

vπlef t = 1 + Eπlef t [0 × γG t+1 ] (48) 

vπlef t = 1 (49) (50) And for πright we get: 

vπlef t = 0 + Eπlef t [0 × γG t+1 ] (51) 

vπlef t = 0 (52) (53) So the optimal policy for γ = 0 is vπlef t . If instead γ = 0 .9, we get for πlef t :20 vπlef t = 1 + Eπlef t [0 .9 × Gt+1 ] (54) 

vπlef t = 1 + Eπlef t [0 .9 × [rt+1 + γG t+2 ]] , (55) (56) where Gt+2 is our expected reward back at our current state. We can negate it and just look at the first loop, as max reward over first loop will create max reward in the limit. Therefore: 

vπlef t = 1 + 0 .9 × 0 = 1 , (57) 

vπright = 0 + 0 .9 × 2 = 1 .8 (58) (59) So the optimal policy for γ = 0 is vπright . If, finally, γ = 0 .5, we get: 

vπlef t = 1 + 0 .5 × 0 = 1 , (60) 

vπright = 0 + 0 .5 × 2 = 1 (61) (62) So both polices are optimal. 

## Exercise 3.23 

Q

Give the Bellman equation for q∗ for the recycling robot. 

A

q∗(s, a ) = ∑ 

> s′,r

p(s′, r |s, a )[ r + γ argmax a∈A q∗(s′, a ′)] where A = {search, wait, recharge } 

## Exercise 3.24 

Q

Figure 3.5 gives the optimal value of the best state of the gridworld as 24.4, to one decimal place. Use your knowledge of the optimal policy and (3.8) to express this value symbolically, and then to compute it to three decimal places. 

A

We can observe from the grid that γ = 22 /24 .4 = 0 .9016 Equation 3.8 was: 

Gt = Rt+1 + γR t+2 + γ2Rt+3 + γ3Rt+4 + γ4Rt+5 + γ5Rt+6 + . . . =

> ∞

∑

> k=0

γkRt+k+1 (63) We can represent the optimal value function v∗ as: 

v∗(A) = r + γ(v∗(A + 1)) (64) = 10 + 0 .9016(16) (65) = 24 .426to 3 d.p. (66) (67) 



21 Exercise 3.25 

Q

Give an equation for v∗ in terms of q∗.

A

v∗(s) = max a∈A qπ∗ (s, a )i.e. returning to the diagram in exercise 3.18, v∗ is defined as selecting the action (in that case of a possible 3) that produces the highest state-action value function 

## Exercise 3.26 

Q

Give an equation for q∗ in terms of v∗ and the four-argument p.

A

q∗(s, a ) = max ∑ 

> s′,r

p(s′, r |s, a )[ r + v∗(s)] 

## Exercise 3.27 

Q

Give an equation for π∗ in terms of q∗

A

The optimal policy is the one that acts greedily w.r.t the optimal state-action value function i.e. it picks the action that has the highest q(s, a ) in the following state. π∗(a|s) = max a∈A (s) q∗(s′, a )



## Exercise 3.28 

Q

Give an equation for π∗ in terms of v∗ and the four-argument p.The optimal policy is the one that acts greedily w.r.t the optimal state value function conditioned on the system dynamics 

A

π∗(a|s) = max a∈A (s)

∑ 

> s′,r

p(s′, r |s, a )[ rv ∗(s′)] 

## Exercise 3.29 

Q

Rewrite the four Bellman equations for the four value functions ( vπ , v ∗, q π , andq ∗) in terms of the three argument function p (3.4) and the two-argument function r (3.5). 

A

tbc 

22 4 Dynamic Programming 

## Exercise 4.1 

Q

In Example 4.1, if π is the equiprobable random policy, what is qπ (11 , down )? What is 

qπ (7 , down )? 

A

The Bellman equation for q(s, a ) is: 

qπ (s, a ) = ∑

> s′,r

p(s′, r |s, a )

[

r + γ ∑

> a′

π(a′|s′)qπ (s′, a ′)

]

(68) For the state-action pairs posed in the question, the Bellman equation becomes: 

qπ (11 , down ) = −1 (69) 

qπ (7 , down ) = −1 + −14 (70) = −15 (71) (72) as γ = 1 because MDP is undiscounted. 

## Exercise 4.2 

Q

In Example 4.1, suppose a new state 15 is added to the gridworld just below state 13, and its actions, left, up, right, and down , take the agent to states 12, 13, 14, and 15, respectively. Assume that the transitions from the original states are unchanged. What, then, is vpi(15) for the equiprobable random policy? Now suppose the dynamics of state 13 are also changed, such that action down from state 13 takes the agent to the new state 15. What is vπ (15) for the equiprobable random policy in this case? 

A

vπ (15) = 0 .25 [( −1 + −20) + ( −1 + −22) + ( −1 + −14) + ( −1 + vπ (15))] (73) = 0 .25 [( −60 + vπ (15))] (74) = −15 + 0 .25 [ vπ (15)] (75) (76) and we know vπ (15) == vπ (13) == −20 as the state transitions and value functions at next state are identical. Therefore we get: 

vπ (15) = −15 + 0 .25 [ −20] (77) = −20 (78) (79) If the dynamics are changed such one can transition from state 13 into 15, the characteristic of the MDP are unchanged. Moving into state 15, which has the same value as state 13 and the same subsequent dynamics, is identical to returning back to state 13 - as was the case previously. The value function is therefore unchanged and vπ (15) = −20 

23 Exercise 4.3 

Q

What are the equations analogous to (4.3), (4.4), and (4.5), but for action-value functions instead of state-value functions? 

A

qπ (s) = Eπ [Rt+1 + γq π (St+1 , A t+1 |St = s, A t = a)] vπ (s) (80) 

qπ (s, a ) = ∑

> s′,r

p(s′, r |s, a )

[

r + γ ∑

> a′

π(a′|s′)qπ (s′, a ′)

]

(81) 

qk+1 (s, a ) = ∑

> s′,r

p(s′, r |s, a )

[

r + γ ∑

> a′

π(a′|s′)qk(s′, a ′)

]

(82) (83) 



## Exercise 4.4 

Q

The policy iteration algorithm on page 80 has a subtle bug in that it may never terminate if the policy continually switches between two or more policies that are equally good. This is okay for pedagogy, but not for actual use. Modify the pseudocode so that convergence is guaranteed. 

A

When taking the argmax over a in the policy improvement step of the algorithm, it’s possible that we continue to flip backward and forward between two actions that are both optimal forever. At the moment, a tie is broken by randomly selecting between the value maximising actions. We could instead always select the first action to result from the argmax, this way we would ensure that the same optimal action is picked during iteration, switching the policy-stable boolean to true, and ensuring convergence. 

## Exercise 4.5 

Q

How would policy iteration be defined for action values? Give a complete algorithm for com-puting q∗, analogous to that on page 80 for computing v∗. Please pay special attention to this exercise, because the ideas involved will be used throughout the rest of the book. 

A

1. Initialization : q(s, a ) and π(s) initialised arbitrarily as before 2. Policy Evaluation : Loop for each state-action pair ( s, a ), s ∈ S , a ∈ A :24 q ← Q(s, a )

Q(s, a ) ← ∑

> s′,r

p(s′, r |s, a )

[

r + γ ∑

> a′

π(a′|s′)Q(s′, a ′)

]

δ ← max (δ, |q − Q(s, a )|)(84) 3. Policy Improvement :policy-stable ← T rue 

Loop for each state-action pair (s,a), s ∈ S , a ∈ A :

old − action ← π(s)

π(s) ← argmax 

> a

∑

> s′,r

p(s′, r |s, a )

[

r + γ ∑

> a′

π(a′|s′)qπ (s′, a ′)

]

if old-action 6 = π(s), then policy-stable ← F alse 

If policy-stable, then stop and return Q ≈ q∗andπ ≈ π∗; else return to 2. (85) 



## Exercise 4.6 

Q

Suppose you are restricted to considering only policies that are -soft, meaning that the prob-ability of selecting each action in each state, s, is at least / |A (s)|. Describe qualitatively the changes that would be required in each of the steps 3, 2, and 1, in that order, of the policy iteration algorithm for v∗ on page 80. 

A

During the policy improvement step (3), instead of the argmax creating a deterministic action in a state, we would update the policy such that each action a ∈ A would receive probability p(a) = / |A (s)|, then the max action would receive probability 1 −  + / |A (s)|. The output policy is therefore stochastic, not deterministic. During the policy evaluation step (2), instead of looping over the states only, we would loop over all states and actions, weighting the value of each state-action by the probability of the action being selecting according to our -soft policy. In step one, the policy would need to be initialised with an arbitrary distribution over the action space in each state. 

## Exercise 4.7 

Q

Write a program for policy iteration and re-solve Jack’s car rental problem with the following changes. One of Jack’s employees at the first location rides a bus home each night and lives near the second location. She is happy to shuttle one car to the second location for free. Each additional car still costs $2, as do all cars moved in the other direction. In addition, Jack has limited parking space at each location. If more than 10 cars are kept overnight at a location (after any moving of cars), then an additional cost of $4 must be incurred to use a second parking lot (independent of how many cars are kept there). These sorts of non-linearities and arbitrary dynamics often occur in real problems and cannot easily be handled by optimization methods other than dynamic programming. To check your program, first replicate the results given for the original problem. 25 A

This is a programming exercise, the relevent code can be found on my GitHub. 

## Exercise 4.8 

Q

Why does the optimal policy for the gambler’s problem have such a curious form? In particular, for capital of 50 it bets it all on one flip, but for capital of 51 it does not. Why is this a good policy? 

A

When the coin is bias against us it makes sense to minimise the number of flips we make as, in the limit, we cannot win. Consequently, we can win with probability 0.4 is we stake our full capital at 50. All other bets besides 50 are designed to get us back to 50 if we lose, or up to 50 if we win, from where we take our 40% chance. For example, when our capital is 55, we stake 5, knowing that we are likely to fall back to 50 where we will go for the win. 

## Exercise 4.9 

Q

Implement value iteration for the gambler’s problem and solve it for ph = 0.25 and ph = 0.55. In programming, you may find it convenient to introduce two dummy states corresponding to termination with capital of 0 and 100, giving them values of 0 and 1 respectively. Show your results graphically, as in Figure 4.3. Are your results stable as θ → 0? 

A

This is a programming exercise, the relevent code can be found on my GitHub. 

## Exercise 4.10 

Q

What is the analog of the value iteration update (4.10) for action values, qk+1 (s, a )? 

A

vk+1 (s) = ∑

> s′,r

p(s′, r |s, a )

[

r + γ argmax 

> a′

qk(s′, a ′)

]

(86) 



26 27 5 Monte Carlo Methods 

## Exercise 5.1 

Q

Consider the diagrams on the right in Figure 5.1. Why does the estimated value function jump up for the last two rows in the rear? Why does it drop off for the whole last row on the left? Why are the frontmost values higher in the upper diagrams than in the lower? 

A

1. The value function jumps for the rows in the rear because the player sticks at 20 and 21, where it is unlikely the dealer beat him given her policy to twist for all hands lower than 17. 2. The value drops when the dealer holds an ace because it can be used to equal either 11 or 1, a stronger position than any of the other hands the dealer could hold. 3. When an ace is usable, the value function is higher because the player can change the value of his ace from 11 to 1 if she is about to go bust. 



## Exercise 5.2 

Q

Suppose every-visit MC was used instead of first-visit MC on the blackjack task. Would you expect the results to be very different? Why or why not? 

A

The state is blackjack is monotonically increasing and memoryless (sampled with replacement), thus you can never revisit an old state in an episode once it has been first visited. Using every visit MC in this case would have no effect on the value function. 

## Exercise 5.3 

Q

What is the backup diagram for Monte Carlo estimation of qπ ?

A  

> Figure 6: Monte carlo backup diagram for estimation of qπfrom one episode



28 Exercise 5.4 

Q

The pseudocode for Monte Carlo ES is inefficient because, for each state–action pair, it maintains a list of all returns and repeatedly calculates their mean. It would be more efficient to use techniques similar to those explained in Section 2.4 to maintain just the mean and a count (for each state–action pair) and update them incrementally. Describe how the pseudocode would be altered to achieve this. 

A

Update formula from section 2.4 is: 

Qn = Qn + 1

n [Rn − Qn] (87) As we reverse through the episode, we initialise value Ns,a for each observed s and a to count the number of visits to the state. Instead of appending G to returns, we use our now initialised 

N , and G to update the value of Q. Doing so is more efficient as we don’t need to hold a list of all returns which does not scale, we just update using the update rule outlined above. 

## Exercise 5.5 

Q

Consider an MDP with a single nonterminal state and a single action that transitions back to the nonterminal state with probability p and transitions to the terminal state with probability 1 − p. Let the reward be +1 on all transitions, and let γ = 1. Suppose you observe one episode that lasts 10 steps, with a return of 10. What are the first-visit and every-visit estimators of the value of the nonterminal state? 

A

For first-visit estimator of the state is the return collected at the end of the episode having visited the first step, assuming we initialise G = 0: G = 10 The every-visit estimator is an average of each of the 10 returns received from the state: 

G = 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 10 = 5 .5 (88) 



## Exercise 5.6 

Q

What is the equation analogous to (5.6) for action values Q(s, a ) instead of state values V (s), again given returns generated using b?

A

Equation 5.6 is as follows: 

V (s) = 

∑  

> t∈T (s)

ρt:T (t)−1Gt

∑  

> t∈T (s)

ρt:T (t)−1

(89) 29 We only require that T tracks state action-pairs rather than just states. Equation 5.6 therefore becomes: 

Q(s, a ) = 

∑  

> t∈T (s,a )

ρt:T (t)−1Gt

∑  

> t∈T (s,a )

ρt:T (t)−1

(90) 



## Exercise 5.7 

Q

In learning curves such as those shown in Figure 5.3 error generally decreases with training, as in-deed happened for the ordinary importance-sampling method. But for the weighted importance-sampling method error first increased and then decreased. Why do you think this happened? 

A

In the initial episodes, we are unlikely to see episodes from the behaviour policy that match our target policy (i.e. hit for all card sums ¡ 20 and stick thereafter), therefore our estimate for V (s)will remain 0, which happens to be close to our ground truth Vπ (s). As we see some trajectories from b that match our target policy, variance in our output will be high initially, leading to a higher error, and will drop gradually as we observe further trajectories until it approaches the true value asymptotically after 10,000 episodes. 

## Exercise 5.8 

Q

The results with Example 5.5 and shown in Figure 5.4 used a first-visit MC method. Suppose that instead an every-visit MC method was used on the same problem. Would the variance of the estimator still be infinite? Why or why not? 

A

The variance of the estimator would remain infinite, as the expected return is still 1 for every-visit to the state. The only difference between first-visit and every-visit MC in this case is that the number of terms increases α to the number of visits to the state and so would continue to run to infinity. 

## Exercise 5.9 

Q

Modify the algorithm for first-visit MC policy evaluation (Section 5.1) to use the incremental implementation for sample averages described in Section 2.4. 

A

Modifying the above to include sample averages we change the last two lines. Instead of ap-pending G to Returns (St) and averaging, we update V (St) directly using: V (St) = V (St) +  

> 1
> n

[G − V (St)] to do this we need to initialise a new variable n that counts the number of cross-episode visits to state St. 

30 Exercise 5.10 

Q

Derive the weighted-average update rule (5.8) from (5.7). Follow the pattern of the derivation of the unweighted rule (2.3). 

A

We have Co = 0 and Cn = ∑nk=1 Wk. Therefore: 

Vn+1 =

∑nk=1 WkGk

Cn

(91) 

Vn+1 Cn =

> n

∑

> k=1

WkGk (92) 

Vn+1 Cn = WnGnn−1∑

> k=1

WkGk (93) 

Vn+1 Cn = WnGn + Vnn−1∑

> k=1

Wk (94) 

Vn+1 Cn = WnGn + VnCn−1 (95) 

Vn+1 Cn = WnGn + Vn (Cn − Wn) (96) ... (97) 

Vn+1 = Vn + Wn

Cn

[Gn − Vn] (98) (99) 



## Exercise 5.11 

Q

In the boxed algorithm for off-policy MC control, you may have been expecting the W update to have involved the importance-sampling ratio π(At |St ) 

> b(At |St )

, but instead it involves 1 

> b(At |St )

. Why is this nevertheless correct? 31 A

Because our policy π(St) is a deterministic, greedy one, we are only observing trajectories where 

π(At|St) = 1, hence the numerator in the equation = 1. 

## Exercise 5.12 

This is a programming exercise, the relevent code can be found on my GitHub. 

## Exercise 5.13 

Q

Show the steps to derive (5.14) from (5.12). 

A

5.12 is: 

ρt:T (t)−1Rt+1 = Rt+1  

> T−1

∏

> k=t

π(Ak|Sk)

b(Ak|Sk) (100) (101) 



## Exercise 5.14 

Q

Modify the algorithm for off-policy Monte Carlo control (page 111) to use the idea of the trun-cated weighted-average estimator (5.10). Note that you will first need to convert this equation to action values. 

A

... 

32 6 Temporal-Difference Learning 

## Exercise 6.1 

Q

If V changes during the episode, then (6.6) only holds approximately; what would the difference be between the two sides? Let Vt denote the array of state values used at time t in the TD error (6.5) and in the TD update (6.2). Redo the derivation above to determine the additional amount that must be added to the sum of TD errors in order to equal the Monte Carlo error. 

A

Equation 6.5 becomes: δt = Rt+1 + γV t(St+1 ) − Vt(St) and equation 6.2 becomes: Vt+1 (St) = 

Vt(St) + α [Rt+1 + γV t(St+1 − Vt(St)]. We then proceed as follows: 

Gt − Vt(St) = Rt+1 + γG t+1 − Vt(St) + γV t(St+1 ) − γV t(St+1 ) (102) = δt + γ(Gt+1 − Vt(St+1 )) (103) = δt + γ(Gt+1 − Vt+1 (St+1 )) + γθ t+1 , with θt = α [Rt+1 + γV t(St+1 − Vt(St))] (104) = δt + γδ t+1 + γ2(Gt+2 − Vt+2 (St+2 )) + γθ t+1 + γ2θt+2 (105) = 

> T−1

∑

> k=t

[γk−tδk + γk−t+1 θk+1 

] (106) 



## Exercise 6.2 

Q

This is an exercise to help develop your intuition about why TD methods are often more efficient than Monte Carlo methods. Consider the driving home example and how it is addressed by TD and Monte Carlo methods. Can you imagine a scenario in which a TD update would be better on average than a Monte Carlo update? Give an example scenario—a description of past experience and a current state—in which you would expect the TD update to be better. Here’s a hint: Suppose you have lots of experience driving home from work. Then you move to a new building and a new parking lot (but you still enter the highway at the same place). Now you are starting to learn predictions for the new building. Can you see why TD updates are likely to be much better, at least initially, in this case? Might the same sort of thing happen in the original scenario? 

A

The hint above gives intuition to the answer. Let’s assume we are trying to learn the optimal policy for playing a round of golf at my local course, and we assume we have already learned the value function for the course previously using monte carlo and td-learning. If 1 of the 18 holes is changed, monte carlo methods would require us to play the whole course to update our understanding of the states relating to the new hole once. With TD-learning, all we have to do is make predictions about our new hole, then we can revert to previously learned value function for the remaining holes. i.e. we bootstrap off of previous knowledge more effectively with TD-learning than monte carlo. Our convergence to the true value function using TD-learning should hence be quicker. 

33 Exercise 6.3 

Q

From the results shown in the left graph of the random walk example it appears that the first episode results in a change in only V (A). What does this tell you about what happened on the first episode? Why was only the estimate for this one state changed? By exactly how much was it changed? 

A

> Figure 7: Random walk example

The result of the first episode suggests the episode terminated at the left block for no reward. The value of state A was updated as follows: 

V (A) = V (A) + α [Rt+1 + V (ST ) − V (A)] (107) = 0 .5 + 0 .1 [0 + 0 − 0.5] (108) = 0 .45 (109) 



## Exercise 6.4 

Q

The specific results shown in the right graph of the random walk example are dependent on the value of the step-size parameter, α. Do you think the conclusions about which algorithm is better would be affected if a wider range of α values were used? Is there a different, fixed value of α at which either algorithm would have performed significantly better than shown? Why or why not? 

A

It appears from the plot the long-term accuracy of TD methods is inversely proportional to the chosen α, which makes sense given larger alphas would cause the value function to oscillate around the true value function. It is not clear from the plot whether different values of α for the MC method would have increased performance as there is no concrete difference in the algorithm performance based on α. It appears the main drawback of the monte carlo method is that it makes significantly fewer value function updates than TD methods. For 100 episodes, the MC method can make no more than 100 updates. For the TD method, the expected episode length is 6, and so it makes 600 value function updates in 100 episodes. No value of α can overcome the reduced sample rate. 

34 Exercise 6.5 

Q

In the right graph of the random walk example, the RMS error of the TD method seems to go down and then up again, particularly at high α’s. What could have caused this? Do you think this always occurs, or might it be a function of how the approximate value function was initialized? 

A

As discussed above, I believe this will always occur for high α as the weight given to the TD error will exaggerate small errors. The will cause the estimated value function to bounce back and forth across the true value without converging. In turn, this will cause the estimate for V (c)(initialised in this example at its true value) to drift away from the correct estimate, increasing RMS error. 

## Exercise 6.6 

Q

In Example 6.2 we stated that the true values for the random walk example are 16 , 26 , 36 , 46 and 56

for states A through E. Describe at least two different ways that these could have been computed. Which would you guess we actually used? Why? 

A

1. Dynamic Programming : we know the policy π (take either action with p(a) = 0 .5), and we know the transition function p(s′, r |s, a ) = 1 ∀s, a , thus the value of each state can be computed exactly. 2. First-visit monte carlo policy prediction : set-up the state space and run simulations with our policy π. After each episode, back-prop the returns to each state and average. I suspect the authors used dynamic programming as it requires solving 6 trivial simultaneous equations, whereas the MC method may require thousands of episodes to converge on the true value. 

## Exercise 6.7 

Q

Design an off-policy version of the TD(0) update that can be used with arbitrary target policy 

π and covering behaviour policy b, using at each step t the importance sampling ratio ρt:t (5.3). 

A

Our TD update is: 

V (s) = V (s) + α [Rt+1 + γV (s′) − V (s)] (110) and our importance sampling ratio is: 

ρt:t = π(A|S)

b(A|S) (111) 35 We assume an episode of experience is produced by our behaviour policy b, and the update becomes: 

Vπ (s) = Vπ (s) + α [ρt:tRt+1 + ρt:tγV (s′) − V (s)] , (112) i.e. each update is weighted by the likelihood of the action being taken by the target policy compared to the behaviour policy, divided by sum of all previous importance samples. 



## Exercise 6.8 

Q

Show that an action-value version of (6.6) holds for the action-value form of the TD error 

δt = Rt+1 + γQ (St+1 , A t+1 ) − Q(St, A t), again assuming that the values don’t change from step to step. 

A

Recall, equation 6.6 was the monte carlo error written in terms of the TD error: 

Gt − V (St) =  

> T−1

∑

> k=t

γk−tδk (113) We amend 6.6 as follows: 

Gt − Q(St, A t) = Rt+1 + γG t+1 − Q(St, A t) + γQ (St+1 , A t+1 ) − γQ (St+1 , A t+1 ) (114) = δt + γ (Gt+1 − Q(St+1 , A t+1 )) (115) = δt + γδ t+1 + γ2 (Gt+2 − Q(St+2 , A t+2 ) (116) ... (117) = 

> T−1

∑

> k=t

γk−tδk (118) 



## Exercise 6.9 

Q

Re-solve the windy gridworld assuming eight possible actions, including the diagonal moves, rather than four. How much better can you do with the extra actions? Can you do even better by including a ninth action that causes no movement at all other than that caused by the wind? 

A

This is a programming exercise, the relevent code can be found on my GitHub. With the extra actions, the optimal policy is now 7 moves as opposed to 15 moves with 4 actions. Adding the 9th action does not improve the optimal policy, the terminal square is 7 moves away from the start square and so adding an action that keeps the agent stationary cannot improve the policy. See Figures 8 and 9 plot the optimal policy for 4 and 8 actions respectively. Each agent learned from 10,000 episodes of self-play. 

36 Figure 8: Optimal policy with 4 available actions 

> Figure 9: Optimal policy with 8 available actions

## Exercise 6.10 

Q

Re-solve the windy gridworld task with King’s moves, assuming that the effect of the wind, if there is any, is stochastic, sometimes varying by 1 from the mean values given for each column. That is, a third of the time you move exactly according to these values, as in the previous exercise, but also a third of the time you move one cell above that, and another third of the time you move one cell below that. For example, if you are one cell to the right of the goal and you move left, then one-third of the time you move one cell above the goal, one-third of the time you move two cells above the goal, and one-third of the time you move to the goal. 

A

Implementation is identical to above with amended transition function. Exercise not yet com-pleted. 

## Exercise 6.11 

Q

Why is Q-learning considered an off-policy control method? 

A

Q-learning is off-policy because the action-selection at St+1 (used for the Q-update) is determin-istic i.e. it chooses the greedy action with probability 1. This is in contrast with the behaviour 37 policy used to collect the data which is -greedy. The policy being updated is therefore different from that being used to collect data, and the algorithm is off-policy. 



## Exercise 6.12 

Q

Suppose action selection is greedy. Is Q-learning then exactly the same algorithm as SARSA? Will they make exactly the same action selections and weight updates? 

A

If action-selection is greedy, the algorithms become identical, but the action selections and weight updates may differ depending on the arbitrary initialisation of Q and S. For example, if each state-action pair is assigned a random value Q(S, A ) ∈ (0 , 1], the greedy action selection in each case will differ. Because action selection differs, updates differ, and because neither algorithm explore, there is no guarantee they will converge on the same solution. 

## Exercise 6.13 

Q

What are the update equations for Double Expected Sarsa with an -greedy target policy? 

A

Instead of taking the maximum action over Q, we continue to follow our -greedy behaviour policy. The expected sarsa update is: 

Q(St, A t) ← Q(St, A t) + α

[

Rt+1 + γ ∑

> a

π(a|St+1 )Q(St+1 , a ) − Q(St, A t)

]

(119) Therefore our updates become: 

Q1(St, A t) ← Q1(St, A t) + α

[

Rt+1 + γ ∑

> a

π(a|St+1 )Q2(St+1 , a ) − Q1(St, A t)

]

(120) 

Q2(St, A t) ← Q2(St, A t) + α

[

Rt+1 + γ ∑

> a

π(a|St+1 )Q1(St+1 , a ) − Q2(St, A t)

]

(121) with our policy π being -greedy. 

## Exercise 6.14 

Q

Describe how the task of Jack’s Car Rental (Example 4.2) could be reformulated in terms of afterstates. Why, in terms of this specific task, would such a reformulation be likely to speed convergence? 38 A

In Jack’s car rental example we each location can hold cars in the range (0,20). Up to 5 cars can be moved from one location to the other overnight to accommodate expected sales, taking one of these actions will move us deterministically to a new state. If there was uncertainty in how we transition between states, it makes sense to learn a conventional value function that probabilistically accounts for this uncertainty, but given the transition is certain, we can learn the afterstates (the states from which we will sell the cars in the morning) and proceed. We speed convergence by reducing the number of states to be evaluated. For example, if our state in the evening is five cars at each location: (5 , 5) and our action is to move one car to the second location such that our morning state becomes (4 , 6), we can evaluate this state as the same as the state-action pair of (4 , 6) and choosing to move no cars. 

39 7 n-step Bootstrapping 

## Exercise 7.1 

Q

In Chapter 6 we noted that the Monte Carlo error can be written as the sum of TD errors (6.6) if the value estimates don’t change from step to step. Show that the n-step error used in (7.2) can also be written as a sum TD errors (again if the value estimates don’t change) generalizing the earlier result. 

A

The n-step error in equation 7.2 is Gt:t+n − Vt+n−1(St) and our generalised TD error is δt:t+n =

Rt+n+1 + γV t+n(St+1 ) − Vt+n(St). As in 6.6, we can rewrite this as: 

Gt:t+n − Vt+n−1(St) = Rt+n+1 + γG t+n+1 − Vt+n(St) (122) = Rt+n+1 + γG t+n+1 − Vt+n(St) + γV t+n(St+1 ) − γV t+n(St+1 ) (123) = δt:t+n + γ(Gt+n+1 + Vt+n(St+1 )) (124) = δt:t+n + γ [Rt+n+2 + γG t+n+2 − Vt+n+1 (St+2 )] (125) = δt:t+n + γδ t+1: t+n+1 + γ2(Gt+n+2 + Vt+n+1 (St+1 )) (126) = δt:t+n + γδ t+1: t+n+1 + γ2δt+2: t+n+2 + · · · + γT −t−1(Gt+n+T −t−1 − Vt+n+T −t−2(ST ) + γT −t(

(127) = δt:t+n + γδ t+1: t+n+1 + γ2δt+2: t+n+2 + · · · + γT −t−1(GT +n−1 − VT +n−2(ST ) + γT −t(0) (128) = 

> T−1

∑

> k=t

γk−tδt+k:n+k (129) (130) 



## Exercise 7.2 

Q

With an n-step method, the value estimates do change from step to step, so an algorithm that used the sum of TD errors (see previous exercise) in place of the error in (7.2) would actually be a slightly different algorithm. Would it be a better algorithm or a worse one? Devise and program a small experiment to answer this question empirically. 

A

This is a programming exercise, the relevent code can be found on my GitHub. 



## Exercise 7.3 

Q

Why do you think a larger random walk task (19 states instead of 5) was used in the examples of this chapter? Would a smaller walk have shifted the advantage to a different value of n? How 40 about the change in left-side outcome from 0 to -1 made in the larger walk? Do you think that made any difference in the best value of n? 

A

• If the smaller, 5-state random walk had been used the optimal value for n would likely have been smaller. As explained in the example, setting n to 3 and observing an episode starting at C and transitioning C → D → E → T erminal would update C toward the reward of 1, which would represent an incorrect estimation of the true value of C. It seems that the likely optimal value in this case would be n = 2, and so we could make the general assumption that for smaller state-spaces, smaller values of n are more appropriate. If n ≥ 2 then, for longer episodes, updates would no longer be bootstrapping on other state value, but instead be making updates based on their own values. 

• I suspect that the change in the left value to -1 from 0 reduced the optimal value of n in this example. Setting the left value to -1 effectively locates states on the left side of the walk closer to a reward, meaning updates need not back-propagate as far to make good updates to the value of these states. 



## Exercise 7.4 

Q

Prove that the n-step return of Sarsa (7.4) can be written exactly in terms of a novel TD error, as: 

Gt:t+n = Qt−1(St, A t) +  

> min (t+n,T )−1

∑

> k=t

γk−t [Rk+1 + γQ k(Sk+1 , A k+1 ) − Qk−1(Sk, A k)] (131) 

A

We have: 

Gt:t+n = Rt+1 + γR t+2 + · · · + γn−1Rt+n + γnQt+n−1(St+n, A t+n) (132) and: 

Qt+n(St, A t) = Qt+n−1(St, A t) + α [Gt:t+n − Qt+n−1(St, A t)] (133) Denote: 

Gt:t+n

.

=

> n

∑

> i=1

γi−1Rt+i + γnQt+n−1(St+n, A t+n) (134) for n ≥ 1 and 0 ≤ t < T − n and with Gt:t+n = Gt if t + n > T 

If we set τ = min( t + n, T ) − 1, we observe that:  

> min (t+n,T )−1

∑

> k=t

γk−t [Rk+1 + γQ k(Sk+1 , A k+1 ) − Qk−1(Sk, A k)] = 

> τ

∑

> k=t

γk−t [Rt+1 + γQ k(Sk+1 , A k+1 − Qk−1(Sk, A k)] (135) = Gt:t+n − Qt−1(St, A t) (136) (137) 



41 Exercise 7.5 

Q

Write the pseudocode for the off-policy state-value prediction algorithm described above. 

A

The algorithm follows much the same form as that described on page 149: 

Figure 10: Off-policy n-step sarsa pseudocode 

Of course, this time we initialize V (s) arbitrarily instead of Q(s, a ). In the final if statement, G

instead becomes: 

G ← ρτ

Rτ +1 +  

> min (τ+n,T )

∑ 

> i=τ+1

γi−τ −1Ri

 + (1 − ρτ )Vτ +n−1(St) (138) and the state value update becomes: 

V (Sτ ) ← V (Sτ ) + α [G − V (Sτ )] (139) 



42 Exercise 7.6 

Q

Prove that the control variate in the above equations does not change the expected value of the return. 

A

In equation 7.13, we know that the expected value of ρt = 1, therefore: 

E [(1 − ρt)Vh−1(St)] = Eb [(1 − ρt)Vh−1(St)] (140) = Eb [(1 − ρt)Vh−1(St)] (141) = Eb [(1 − 1) Vh−1(St)] (142) = 0 (143) (144) In equation 7.14, the control variate is slightly different, we have: 

Eb

[ ¯Vh − 1( St+1 − ρt+1 Qh − 1( St+1 , A t+1 )) ] = ∑

> a

π(a|St+1 )Qh−1(St+1 , a ) − ∑

> a

b(a|St+1 )ρt+1 Qh−1(St+1 , a )(145) = ∑

> a

π(a|St+1 )Qh−1(St+1 , a ) − ∑

> a

b(a|St+1 ) π(a|St+1 )

b(a|St+1 ) Qh−1(St+1 , a )(146) = 0 (147) (148) 



## Exercise 7.7 

Q

Write the pseudocode for the off-policy action-value prediction algorithm described immediately above. Pay particular attention to the termination conditions for the recursion upon hitting the horizon or the end of episode. 

A

TBC 



## Exercise 7.8 

Q

Show that the general (off-policy) version of the n-step return (7.13) can still be written exactly and compactly as the sum of state-based TD errors (6.5) if the approximate state value function does not change. 

A

TBC 



43 Exercise 7.9 

Q

Repeat the above exercise for the action version of the off-policy n-step return (7.14) and the Expected Sarsa TD error (the quantity in brackets in Equation 6.9). 

A

TBC 



## Exercise 7.10 

Q

Devise a small off-policy prediction problem and use it to show that the off-policy learning algorithm using (7.13) and (7.2) is more data efficient than the simpler algorithm using (7.1) and (7.9). 

A

TBC 



## Exercise 7.11 

Q

Show that if the approximate action values are unchanging, then the tree-backup return (7.16) can be written as a sum of expectation-based TD errors: 

A

If the action values are unchanging then we get: 

Gt:t+n = Rt+1 + γ ∑ 

> a6=At+1

π(a|St+1 )Q(St+1 , a ) + γπ (At+1 |St+1 )Gt+1: t+n (149) (150) We have been given: 

δt

.

= Rt+1 + γ ¯V (St+1 ) − Q(St, A t) (151) and: ¯Vh

.

= ∑

> a

π(a|Sh)Q(Sh, a ) (152) 44 Then we can say: 

Gt:t+n − Q(St, A t) = Rt+1 + γ ¯V (St+1 ) − γπ (At+1 |St+1 )Q(St+1 , A t+1 ) + γπ (At+1 |St+1 )Gt+1: t+n − Q(St, A t)(153) = δt − γπ (At+1 |St+1 )Q(St+1 , A t+1 ) + γπ (At+1 |St+1 )Gt+1: t+n (154) = δt + γπ (At+1 |St+1 ) [ Gt+1: t+n − Q(St+1 , A t+1 )] (155) = ... (156) 

Gt:t+n = Q(St, A t) +  

> min (t+n,T )−1

∑

> i=1

δii∏

> j=t+1

γπ (Aj , S j ) (157) (158) where the product operator has the behaviour ∏ba[˙] = 1 for a > b . Shoutout to Bryn Hayder for this answer. 



45 8 Planning and Learning with Tabular Methods 

## Exercise 8.1 

Q

The nonplanning method looks particularly poor in Figure 8.3 because it is a one-step method; a method using multi-step bootstrapping would do better. Do you think one of the multi-step bootstrapping methods from Chapter 7 could do as well as the Dyna method? Explain why or why not. 

A

If we used a multi-step bootstrapping method (e.g. n-step Sarsa), we could back-propogate the reward from the final timestep along the trajectory followed for some large value of n. This of course would only update the action-values of the n action-values prior to receiving the reward and leave the remain 1700 - n action values unchanged. When running a second episode using this approach, the agent would still act naively until it reached its first state-action pair with some value, which it could then bootstrap from to update previous states. Without a model of the environment (like Dyna) it cannot plan in the same way, and cannot reap the efficiency gains that Dyna enjoys. 



## Exercise 8.2 

Q

Why did the Dyna agent with exploration bonus, Dyna-Q+, perform better in the first phase as well as in the second phase of the blocking and shortcut experiments? 

A

I’m not sure it is performing better , rather that the Dyna-Q+ algorithm is increasing the reward associated with every state at every timestep when Dyna-Q is not, so cumulative reward must be higher in absolute terms than Dyna-Q. In this sense a direct comparison on the basis of cu-mulative reward is perhaps unfair. Due to the increased exploration of the Dyna-Q+ algorithm, it is however likely that it found the optimal policy more quickly than Dyna-Q and so was able to exploit it quicker for higher cumulative reward 



## Exercise 8.3 

Q

Careful inspection of Figure 8.5 reveals that the difference between Dyna-Q+ and Dyna-Q narrowed slightly over the first part of the experiment. What is the reason for this? 

A

Dyna-Q+ is forced to explore continually having already obtained the optimal policy, meaning that when Dyna-Q is exploiting its learned optimal policy, Dyna-Q+ is exploring sub-optimal trajectories and receiving less reward. 



46 Exercise 8.4 

Q

The exploration bonus described above actually changes the estimated values of states and actions. Is this necessary? Suppose the bonus k√τ was used not in updates, but solely in action selection. That is, suppose the action selected was always that for which Q(St, a ) + k√τ (St, a )was maximal. Carry out a gridworld experiment that tests and illustrates the strengths and weaknesses of this alternate approach. 

A

This is a programming exercise, the relevent code can be found on my GitHub. Summary of the models:  

> Figure 11: Cumulative reward for three model-based agents on the blocked maze task after 10000 timesteps

Dyna Q uses a conventional e-greedy policy, and plans with a model that uses only previously received states and rewards. 

Dyna Q+ uses a conventional e-greedy policy, and plans with a model that gives additional value to the action proportionate to the time passed since they were last selected. Doing so adds arbitrary value to the value function. 

Dyna New uses a novel policy that adds value to each action before selection, in the same way as Dyna Q+, then selects the value maximising action. This combines exploration and exploitation unlike the above two that keep these regimes separate. Figure 11 illustrates the different learning rates of the three agents. Dyna Q learns fastest initially as it can use its model to learn the optimal policy quickly, but struggles to adapt to the maze block changes after timestep 10000 as its model is inflexible to change. Dyna Q+ has a higher degree of exploration than Dyna Q (because it explores both in the real environment and the simulated environment while planning) and so does not find the optimal policy as quickly as Dyna Q. It does, however, adapt to the wall switch speedily, and exploits its new knowledge to find the optimal policy. Finally, Dyna New, finds the optimal policy before the wall switch, 47 then struggles to capture it post-switch. This is because Dyna New cannot perform exploration in planning, it only explores when taking actions in the real environment. This means that it will take many timesteps before a string of actions taking it to the other side of the grid build enough value for it to be explored. Dyna Q Plus performs best in the long run by combining exploration in planning, and exploita-tion in the real environment. It does however seem these results are subject to initialisation and hyper-parameters. In some runs of the experiment Dyna New never found the optimal policy before the wall switch, its performance seems to be closely linked to the initialisation of τ



## Exercise 8.5 

Q

How might the tabular Dyna-Q algorithm shown on page 164 be modified to handle stochastic environments? How might this modification perform poorly on changing environments such as considered in this section? How could the algorithm be modified to handle stochastic environ-ments and changing environments? 

A

> Figure 12: Tabular Dyna-Q algorithm

• In part (e) of the algorithm, instead of updating R and S′ directly, we would store samples of R and S′ from which we can compute distributions and thus expectations. 

• This would perform poorly because it would be bias toward earlier observations made in the unchanged environment. 

• We could likely rectify this by weighting more recent observations, or discounting past observations in the distribution. Equally we could quantify the agent’s confidence in its model e.g. if it hasn’t selected a state-action pair in a long time, its confidence in its model should be low and vice versa. This could manifest as a relationship with τ as discussed with Dyna-Q+. 



48 Exercise 8.6 

Q

The analysis above assumed that all of the b possible next states were equally likely to occur. Suppose instead that the distribution was highly skewed, that some of the b states were much more likely to occur than most. Would this strengthen or weaken the case for sample updates over expected updates? Support your answer. 

A

A skewed distribution would strengthen the case for sample-based updates. We are more likely to sample from weighted parts of the distribution and so our estimate of the expected value will approach the true value quicker than would be the case with a uniform distribution i.e. our initial samples will provide a good estimate of the true value. The expectation will require the same computational effort regardless of the shape of the distribution. 



## Exercise 8.7 

Q

Some of the graphs in Figure 8.8 seem to be scalloped in their early portions, particularly the upper graph for b = 1 and the uniform distribution. Why do you think this is? What aspects of the data shown support your hypothesis? 

A

In the uniform distribution case with b = 1 the start-state is updated every |T | updates, at which point it’s value will be moved toward it’s new value. Whereas in the on-policy case, the start state is visited with probability 0 .1 (given this is the probability of termination) and so it is updated far more regularly. The time taken to wait for the updates in the uniform case (when other states not close to the start state are being updated) is when the scallops appear in the curves. 



49 9 On-policy Control with Approximation 

## Exercise 10.1 

Q

We have not explicitly considered or given pseudocode for any Monte Carlo methods in this chapter. What would they be like? Why is it reasonable not to give pseudocode for them? How would they perform on the Mountain Car task? 

A

• Episodes would be rolled-out using an -soft policy, with states, actions and rewards stored in memory. Then, we loop through each state-action pair visited in the episode updating the weights of our function approximator based on the returns observed thereafter. Control would be performed by following our -soft policy on the obtained value function. 

• Pseudocode likely not provided because the algorithm is trivial compared to n-step sarsa. 

• With the monte carlo return being an unbiased estimator of Ut, it is possible that monte carlo control could converge on the optimal solution to the mountain car task quicker than 

n-step sarsa. 



## Exercise 10.2 

Q

Give pseudocode for semi-gradient one-step Expected Sarsa for control. 

A

n-step sarsa pseudocode is: The algorithm would be amended to have n = 1 and the weight update rule as 

wt+1 ← wt + α

[

Rt+1 + γ ∑

> a

π(a|St+1 )ˆ q(St, a, w) − ˆq(St, A t, w)

]

∇ˆq(St, A t, w) (159) 



## Exercise 10.3 

Q

Why do the results shown in Figure 10.4 have higher standard errors at large n than at small 

n?

A

The number of n step permutations grows exponentially in n, so the variance of the n-step update will grow with n. 

## Exercise 10.4 

Q

Give pseudocode for a differential version of semi-gradient Q-learning. 50 Figure 13: Episodic semi-gradient n-step sarsa for estimating ˆq ≈ q∗

A

Pseudocode for differential semi-gradient sarsa is given in Figure 14. The algorithm is the same other than the action selection for A′ is greedy, not -greedy. 

## Exercise 10.5 

Q

What equations are needed (beyond 10.10) to specify the differential version of TD(0)? 

A

We need to specify the update to our estimated average return rate ¯R and our update to the weights of our function approximator. Which are: ¯R ← ¯R + βδ (160) and 

w ← w + αδ ∇ˆv(S, w) (161) 51 Figure 14: Differential semi-gradient sarsa for estimating ˆq ≈ q∗

## Exercise 10.6 

Q

Suppose there is an MDP that under any policy produces the deterministic sequence of rewards +1, 0, +1, 0, +1, 0,... going on forever. Technically, this violates ergodicity; there is no stationary limiting distribution μπ and the limit (10.7) does not exist. Nevertheless, the average reward (10.6) is well defined. What is it? Now consider two states in this MDP. From A, the reward sequence is exactly as described above, starting with a +1, whereas, from B, the reward sequence starts with a 0 and then continues with +1, 0, +1, 0,.... We would like to compute the differential values of A and B. Unfortunately, the differential return (10.9) is not well defined when starting from these states as the implicit limit does not exist. To repair this, one could alternatively define the differential value of a state as (see below). Under this definition, what are the differential values of states A and B?

A

10.6 is 

r(π) .

= lim 

> h→∞

1

h

> h

∑

> t=1

E [Rt|S0, A 0: t−1 π] (162) = lim 

> h→∞

1

h

> h

∑

> t=1

0.5 (163) = 0 .5 (164) and the new expression for the differential value is 

vπ (s) .

= lim  

> γ→1

lim 

> h→∞
> h

∑

> t=0

γt (Eπ [Rt+1 |S0 = s] − r(π)) (165) 52 We can rewrite this as 

v(A; γ) = 0 − ¯R + γV (B; γ) (166) 

v(B; γ) = 1 − ¯R + γV (A; γ) (167) (168) so 

v(A; γ) = 0 − ¯R + γ (1 − ¯R + γV (A; γ)) (169) = γ2V (A; γ) − ¯R(1 + γ) + γ (170) = γ2V (A; γ) + 12 γ − 12 as ¯R = 0 .5 (171) = 121 − γ

1 − γ2 (172) = 12(1 + γ) (173) So V (A) = lim γ→1 V (A; γ) = 14 and V (A; γ) = 34 .

## Exercise 10.7 

Q

Consider a Markov reward process consisting of a ring of three states A, B, and C, with state transitions going deterministically around the ring. A reward of +1 is received upon arrival in A and otherwise the reward is 0. What are the differential values of the three states, using (10.13)? 

A

We can deduce that r(π) = 13 . Then we write 

v(A; γ) = 0 − ¯R + γV (B; γ) (174) 

v(B; γ) = 0 − ¯R + γV (C; γ) (175) 

v(C; γ) = 1 − ¯R + γV (A; γ) (176) (177) We get 

v(A; γ) = 0 − ¯R + γ [0 − ¯R + γ [1 − ¯R + γV (A; γ)]] (178) = − 13 − γ 13 + 23 γ2 + γ3v(A; γ) (179) = 13 (2 γ2 − γ − 1) + γ3

> ∞

∑

> t=0

γt(at − 13 ) (180) = 13(2 γ2 − γ − 1) 1 − γ3 (181) = − 132γ + 1 

γ2 + γ + 1 (182) as lim γ→1 V (A) → − 13 , therefore V (B) = 0 and V (C) = 13 .53 Exercise 10.8 

Q

The pseudocode in the box on page 251 updates ¯Rt using t as an error rather than simply 

Rt+1 − ¯Rt. Both errors work, but using t is better. To see why, consider the ring MRP of three states from Exercise 10.7. The estimate of the average reward should tend towards its true value of 1 3 . Suppose it was already there and was held stuck there. What would the sequence of 

Rt+1 − ¯Rt. errors be? What would the sequence of t errors be (using Equation 10.10)? Which error sequence would produce a more stable estimate of the average reward if the estimate were allowed to change in response to the errors? Why? 

A

If we fix ¯Rt = 13 then our sequence of differential rewards, starting at state A, become: 

− 13 , − 13 , 23 , − 13 , − 13 , 23 , . . . (183) Instead our td error, defined by δt

.

= Rt+1 − ¯Rt +ˆ q(St+1 , A t+1 , wt)−ˆq(St, A t, wt) gives differential rewards: 0, 0, 0, 0, 0, 0, . . . (184) The invariance in our output will, correctly, cause no updates to our already converged estimate of the average return r(π). 

## Exercise 10.9 

Q

In the differential semi-gradient n-step Sarsa algorithm, the step-size parameter on the average reward, β , needs to be quite small so that ¯R becomes a good long-term estimate of the average reward. Unfortunately, ¯R will then be biased by its initial value for many steps, which may make learning inefficient. Alternatively, one could use a sample average of the observed rewards for ¯R. That would initially adapt rapidly but in the long run would also adapt slowly. As the policy slowly changed, ¯R would also change; the potential for such long-term nonstationarity makes sample-average methods ill-suited. In fact, the step-size parameter on the average reward is a perfect place to use the unbiased constant-step-size trick from Exercise 2.7. Describe the specific changes needed to the boxed algorithm for differential semi-gradient n-step Sarsa to use this trick 

A

As per exercise 2.7 we define β to be: 

βnew ← β

¯on

(185) with ¯on ← ¯on−1 + α(1 − ¯on−1) with ¯o0

.

= 0 (186) 54