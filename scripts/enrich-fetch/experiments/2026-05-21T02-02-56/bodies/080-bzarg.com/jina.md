# How a Kalman filter works, in pictures | Bzarg

Typesetting math: 25%

![Image 21](https://bzarg.com/bz_128.png)
# [Bzarg](https://www.bzarg.com/ "Bzarg")

## On the future, science, & tech

Menu[Skip to content](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures#content "Skip to content")

*   [Home](https://www.bzarg.com/)
*   [About](https://www.bzarg.com/about/)
*   [Projects](https://www.bzarg.com/projects/)

# How a Kalman filter works, in pictures

I have to tell you about the Kalman filter, because what it does is pretty damn amazing.

Surprisingly few software engineers and scientists seem to know about it, and that makes me sad because it is such a general and powerful tool for **combining information** in the presence of uncertainty. At times its ability to extract accurate information seems almost magical— and if it sounds like I’m talking this up too much, then take a look at [this previously posted video](https://www.bzarg.com/p/improving-imu-attitude-estimates-with-velocity-data) where I demonstrate a Kalman filter figuring out the _orientation_ of a free-floating body by looking at its _velocity_. Totally neat!

# What is it?

You can use a Kalman filter in any place where you have **uncertain information** about some dynamic system, and you can make an **educated guess** about what the system is going to do next. Even if messy reality comes along and interferes with the clean motion you guessed about, the Kalman filter will often do a very good job of figuring out what actually happened. And it can take advantage of correlations between crazy phenomena that you maybe wouldn’t have thought to exploit!

Kalman filters are ideal for systems which are **continuously changing**. They have the advantage that they are light on memory (they don’t need to keep any history other than the previous state), and they are very fast, making them well suited for real time problems and embedded systems.

The math for implementing the Kalman filter appears pretty scary and opaque in most places you find on Google. That’s a bad state of affairs, because the Kalman filter is actually super simple and easy to understand if you look at it in the right way. Thus it makes a great article topic, and I will attempt to illuminate it with lots of clear, pretty pictures and colors. The prerequisites are simple; all you need is a basic understanding of probability and matrices.

I’ll start with a loose example of the kind of thing a Kalman filter can solve, but if you want to get right to the shiny pictures and math, feel free to [jump ahead](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures#mathybits).

# What can we do with a Kalman filter?

Let’s make a toy example: You’ve built a little robot that can wander around in the woods, and the robot needs to know exactly where it is so that it can navigate.

![Image 22: Your little robot](https://www.bzarg.com/wp-content/uploads/2015/08/robot_forest-300x160.png)

We’ll say our robot has a state  \vec{x_k} x k→, which is just a position and a velocity:

\vec{x_k} = (\vec{p}, \vec{v})x k→=(p⃗,v⃗)

Note that the state is just a list of numbers about the underlying configuration of your system; it could be anything. In our example it’s position and velocity, but it could be data about the amount of fluid in a tank, the temperature of a car engine, the position of a user’s finger on a touchpad, or any number of things you need to keep track of.

Our robot also has a GPS sensor, which is accurate to about 10 meters, which is good, but it needs to know its location more precisely than 10 meters. There are lots of gullies and cliffs in these woods, and if the robot is wrong by more than a few feet, it could fall off a cliff. So GPS by itself is not good enough.

[![Image 23: Oh no.](https://www.bzarg.com/wp-content/uploads/2015/08/robot_ohnoes-300x283.png)](https://www.bzarg.com/wp-content/uploads/2015/08/robot_ohnoes.png)

We might also know something about how the robot moves: It knows the commands sent to the wheel motors, and its knows that if it’s headed in one direction and nothing interferes, at the next instant it will likely be further along that same direction. But of course it doesn’t know everything about its motion: It might be buffeted by the wind, the wheels might slip a little bit, or roll over bumpy terrain; so the amount the wheels have turned might not exactly represent how far the robot has actually traveled, and the prediction won’t be perfect.

The GPS **sensor** tells us something about the state, but only indirectly, and with some uncertainty or inaccuracy. Our **prediction** tells us something about how the robot is moving, but only indirectly, and with some uncertainty or inaccuracy.

But if we use all the information available to us, can we get a better answer than **either estimate would give us by itself**? Of course the answer is yes, and that’s what a Kalman filter is for.

[](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures)

# How a Kalman filter sees your problem

Let’s look at the landscape we’re trying to interpret. We’ll continue with a simple state having only position and velocity.  \vec{x} = \begin{bmatrix} p\\ v \end{bmatrix}

x⃗=[p v]

We don’t know what the _actual_ position and velocity are; there are a whole range of possible combinations of position and velocity that might be true, but some of them are more likely than others:

![Image 24: gauss_0](https://www.bzarg.com/wp-content/uploads/2015/08/gauss_0.png)

The Kalman filter assumes that both variables (postion and velocity, in our case) are random and _Gaussian distributed._ Each variable has a **mean** value \mu μ, which is the center of the random distribution (and its most likely state), and a **variance**\sigma^2 σ 2, which is the uncertainty:

![Image 25: gauss_1](https://www.bzarg.com/wp-content/uploads/2015/08/gauss_1.png)

In the above picture, position and velocity are **uncorrelated**, which means that the state of one variable tells you nothing about what the other might be.

The example below shows something more interesting: Position and velocity are **correlated**. The likelihood of observing a particular position depends on what velocity you have:

![Image 26: gauss_3](https://www.bzarg.com/wp-content/uploads/2015/08/gauss_3.png)This kind of situation might arise if, for example, we are estimating a new position based on an old one. If our velocity was high, we probably moved farther, so our position will be more distant. If we’re moving slowly, we didn’t get as far.

This kind of relationship is really important to keep track of, because it gives us **more information:**One measurement tells us something about what the others could be. And that’s the goal of the Kalman filter, we want to squeeze as much information from our uncertain measurements as we possibly can!

This correlation is captured by something called a [covariance matrix](https://en.wikipedia.org/wiki/Covariance_matrix). In short, each element of the matrix \Sigma_{ij}Σ i j is the degree of correlation between the _ith_ state variable and the _jth_ state variable. (You might be able to guess that the covariance matrix is [symmetric](https://en.wikipedia.org/wiki/Symmetric_matrix), which means that it doesn’t matter if you swap _i_ and _j_). Covariance matrices are often labelled “\mathbf{\Sigma}Σ”, so we call their elements “\Sigma_{ij}Σ i j”.

![Image 27: gauss_2](https://www.bzarg.com/wp-content/uploads/2015/08/gauss_2.png)

# Describing the problem with matrices

We’re modeling our knowledge about the state as a Gaussian blob, so we need two pieces of information at time k k: We’ll call our best estimate \mathbf{\hat{x}_k}x^k (the mean, elsewhere named \mu μ ), and its covariance matrix \mathbf{P_k}P k.  \begin{equation} \label{eq:statevars} \begin{aligned} \mathbf{\hat{x}}_k &= \begin{bmatrix} \text{position}\\ \text{velocity} \end{bmatrix}\\ \mathbf{P}_k &= \begin{bmatrix} \Sigma_{pp} & \Sigma_{pv} \\ \Sigma_{vp} & \Sigma_{vv} \\ \end{bmatrix} \end{aligned} \end{equation}

x^k P k=[position velocity]=[Σ p p Σ v p Σ p v Σ v v](1)

(Of course we are using only position and velocity here, but it’s useful to remember that the state can contain any number of variables, and represent anything you want).

Next, we need some way to look at the **current state** (at time **k-1**) and **predict the next state** at time **k**. Remember, we don’t know which state is the “real” one, but our prediction function doesn’t care. It just works on _all of them_, and gives us a new distribution:

![Image 28: gauss_7](https://www.bzarg.com/wp-content/uploads/2015/08/gauss_7.jpg)We can represent this prediction step with a matrix, \mathbf{F_k}F k:

![Image 29: gauss_8](https://www.bzarg.com/wp-content/uploads/2015/08/gauss_8.jpg)It takes _every point_ in our original estimate and moves it to a new predicted location, which is where the system would move if that original estimate was the right one.

Let’s apply this. How would we use a matrix to predict the position and velocity at the next moment in the future? We’ll use a really basic kinematic formula: \begin{split} \color{deeppink}{p_k} &= \color{royalblue}{p_{k-1}} + \Delta t &\color{royalblue}{v_{k-1}} \\ \color{deeppink}{v_k} &= &\color{royalblue}{v_{k-1}} \end{split}

p k v k=p k−1+Δ t=v k−1 v k−1

 In other words:  \begin{align} \color{deeppink}{\mathbf{\hat{x}}_k} &= \begin{bmatrix} 1 & \Delta t \\ 0 & 1 \end{bmatrix} \color{royalblue}{\mathbf{\hat{x}}_{k-1}} \\ &= \mathbf{F}_k \color{royalblue}{\mathbf{\hat{x}}_{k-1}} \label{statevars} \end{align} 

x^k=[1 0 Δ t 1]x^k−1=F k x^k−1(2)(3)

We now have a **prediction matrix** which gives us our next state, but we still don’t know how to update the covariance matrix.

This is where we need another formula. If we multiply every point in a distribution by a matrix \color{firebrick}{\mathbf{A}}A, then what happens to its covariance matrix \Sigma Σ?

Well, it’s easy. I’ll just give you the identity: \begin{equation} \begin{split} Cov(x) &= \Sigma\\ Cov(\color{firebrick}{\mathbf{A}}x) &= \color{firebrick}{\mathbf{A}} \Sigma \color{firebrick}{\mathbf{A}}^T \end{split} \label{covident} \end{equation}

C o v(x)C o v(A x)=Σ=A Σ A T(4)

So combining \eqref{covident}[(4)](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures#mjx-eqn-covident) with equation \eqref{statevars}[(3)](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures#mjx-eqn-statevars): \begin{equation} \begin{split} \color{deeppink}{\mathbf{\hat{x}}_k} &= \mathbf{F}_k \color{royalblue}{\mathbf{\hat{x}}_{k-1}} \\ \color{deeppink}{\mathbf{P}_k} &= \mathbf{F_k} \color{royalblue}{\mathbf{P}_{k-1}} \mathbf{F}_k^T \end{split} \end{equation}

x^k P k=F k x^k−1=F k P k−1 F T k(5)

## External influence

We haven’t captured everything, though. There might be some changes that **aren’t related to the state** itself— the outside world could be affecting the system.

For example, if the state models the motion of a train, the train operator might push on the throttle, causing the train to accelerate. Similarly, in our robot example, the navigation software might issue a command to turn the wheels or stop. If we know this additional information about what’s going on in the world, we could stuff it into a vector called \color{darkorange}{\vec{\mathbf{u}_k}}u k→, do something with it, and add it to our prediction as a correction.

Let’s say we know the expected acceleration \color{darkorange}{a}a due to the throttle setting or control commands. From basic kinematics we get:  \begin{split} \color{deeppink}{p_k} &= \color{royalblue}{p_{k-1}} + {\Delta t} &\color{royalblue}{v_{k-1}} + &\frac{1}{2} \color{darkorange}{a} {\Delta t}^2 \\ \color{deeppink}{v_k} &= &\color{royalblue}{v_{k-1}} + & \color{darkorange}{a} {\Delta t} \end{split}

p k v k=p k−1+Δ t=v k−1+v k−1+1 2 a Δ t 2 a Δ t

 In matrix form:  \begin{equation} \begin{split} \color{deeppink}{\mathbf{\hat{x}}_k} &= \mathbf{F}_k \color{royalblue}{\mathbf{\hat{x}}_{k-1}} + \begin{bmatrix} \frac{\Delta t^2}{2} \\ \Delta t \end{bmatrix} \color{darkorange}{a} \\ &= \mathbf{F}_k \color{royalblue}{\mathbf{\hat{x}}_{k-1}} + \mathbf{B}_k \color{darkorange}{\vec{\mathbf{u}_k}} \end{split} \end{equation} 

x^k=F k x^k−1+[Δ t 2 2 Δ t]a=F k x^k−1+B k u k→(6)

\mathbf{B}_k is called the **control matrix** and \color{darkorange}{\vec{\mathbf{u}_k}} the **control vector.** (For very simple systems with no external influence, you could omit these).

Let’s add one more detail. What happens if our prediction is not a 100% accurate model of what’s actually going on?

## External uncertainty

Everything is fine if the state evolves based on its own properties. Everything is _still_ fine if the state evolves based on external forces, so long as we know what those external forces are.

But what about forces that we _don’t_ know about? If we’re tracking a quadcopter, for example, it could be buffeted around by wind. If we’re tracking a wheeled robot, the wheels could slip, or bumps on the ground could slow it down. We can’t keep track of these things, and if any of this happens, our prediction could be off because we didn’t account for those extra forces.

We can model the uncertainty associated with the “world” (i.e. things we aren’t keeping track of) by adding some new uncertainty after every prediction step:

![Image 30: gauss_9](https://www.bzarg.com/wp-content/uploads/2015/08/gauss_9.jpg)

Every state in our original estimate could have moved to a _range_ of states. Because we like Gaussian blobs so much, we’ll say that each point in \color{royalblue}{\mathbf{\hat{x}}_{k-1}} is moved to somewhere inside a Gaussian blob with covariance \color{mediumaquamarine}{\mathbf{Q}_k}. Another way to say this is that we are treating the untracked influences as **noise** with covariance \color{mediumaquamarine}{\mathbf{Q}_k}.

[![Image 31: gauss_10a](https://www.bzarg.com/wp-content/uploads/2015/08/gauss_10a.jpg)](https://www.bzarg.com/wp-content/uploads/2015/08/gauss_10a.jpg)This produces a new Gaussian blob, with a different covariance (but the same mean):

![Image 32: gauss_10b](https://www.bzarg.com/wp-content/uploads/2015/08/gauss_10b.jpg)

We get the expanded covariance by simply **adding**{\color{mediumaquamarine}{\mathbf{Q}_k}}, giving our complete expression for the **prediction step**:  \begin{equation} \begin{split} \color{deeppink}{\mathbf{\hat{x}}_k} &= \mathbf{F}_k \color{royalblue}{\mathbf{\hat{x}}_{k-1}} + \mathbf{B}_k \color{darkorange}{\vec{\mathbf{u}_k}} \\ \color{deeppink}{\mathbf{P}_k} &= \mathbf{F_k} \color{royalblue}{\mathbf{P}_{k-1}} \mathbf{F}_k^T + \color{mediumaquamarine}{\mathbf{Q}_k} \end{split} \label{kalpredictfull} \end{equation}

In other words, the **new best estimate** is a **prediction** made from**previous best estimate**, plus a **correction** for **known external influences**.

And the **new uncertainty** is **predicted** from the **old uncertainty**, with some **additional uncertainty from the environment**.

All right, so that’s easy enough. We have a fuzzy estimate of where our system might be, given by \color{deeppink}{\mathbf{\hat{x}}_k} and \color{deeppink}{\mathbf{P}_k}. What happens when we get some data from our sensors?

# Refining the estimate with measurements

We might have several sensors which give us information about the state of our system. For the time being it doesn’t matter what they measure; perhaps one reads position and the other reads velocity. Each sensor tells us something **indirect** about the state— in other words, the sensors operate on a state and produce a set of **readings**.

![Image 33: gauss_12](https://www.bzarg.com/wp-content/uploads/2015/08/gauss_12.jpg)Notice that the units and scale of the reading might not be the same as the units and scale of the state we’re keeping track of. You might be able to guess where this is going: We’ll model the sensors with a matrix, \mathbf{H}_k.

![Image 34: gauss_12](https://www.bzarg.com/wp-content/uploads/2015/08/gauss_13.jpg)

We can figure out the distribution of sensor readings we’d expect to see in the usual way:  \begin{equation} \begin{aligned} \vec{\mu}_{\text{expected}} &= \mathbf{H}_k \color{deeppink}{\mathbf{\hat{x}}_k} \\ \mathbf{\Sigma}_{\text{expected}} &= \mathbf{H}_k \color{deeppink}{\mathbf{P}_k} \mathbf{H}_k^T \end{aligned} \end{equation}

One thing that Kalman filters are great for is dealing with _sensor noise_. In other words, our sensors are at least somewhat unreliable, and every state in our original estimate might result in a _range_ of sensor readings. ![Image 35: gauss_12](https://www.bzarg.com/wp-content/uploads/2015/08/gauss_14.jpg)

From each reading we observe, we might guess that our system was in a particular state. But because there is uncertainty, **some states are more likely than others** to have have produced the reading we saw:![Image 36: gauss_11](https://www.bzarg.com/wp-content/uploads/2015/08/gauss_11.jpg)

We’ll call the **covariance** of this uncertainty (i.e. of the sensor noise) \color{mediumaquamarine}{\mathbf{R}_k}. The distribution has a **mean** equal to the reading we observed, which we’ll call \color{yellowgreen}{\vec{\mathbf{z}_k}}.

So now we have two Gaussian blobs: One surrounding the mean of our transformed prediction, and one surrounding the actual sensor reading we got.

![Image 37: gauss_4](https://www.bzarg.com/wp-content/uploads/2015/08/gauss_4.jpg)

We must try to reconcile our guess about the readings we’d see based on the **predicted state** (**pink**) with a _different_ guess based on our **sensor readings** (**green**) that we actually observed.

So what’s our new most likely state? For any possible reading (z_1,z_2), we have two associated probabilities: (1) The probability that our sensor reading\color{yellowgreen}{\vec{\mathbf{z}_k}} is a (mis-)measurement of (z_1,z_2), and (2) the probability that our previous estimate thinks (z_1,z_2) is the reading we should see.

If we have two probabilities and we want to know the chance that _both_ are true, we just multiply them together. So, we take the two Gaussian blobs and multiply them:

![Image 38: gauss_5](https://www.bzarg.com/wp-content/uploads/2015/08/gauss_6a.png)

What we’re left with is the **overlap**, the region where _both_ blobs are bright/likely. And it’s a lot more precise than either of our previous estimates. The mean of this distribution is the configuration for which **both estimates are most likely**, and is therefore the **best guess** of the true configuration given all the information we have.

Hmm. This looks like another Gaussian blob.

![Image 39: gauss_6](https://www.bzarg.com/wp-content/uploads/2015/08/gauss_6.png)

As it turns out, when you multiply two Gaussian blobs with separate means and covariance matrices, you get a _new_ Gaussian blob with its **own** mean and covariance matrix! Maybe you can see where this is going: There’s got to be a formula to get those new parameters from the old ones!

# Combining Gaussians

Let’s find that formula. It’s easiest to look at this first in **one dimension**. A 1D Gaussian bell curve with variance \sigma^2 and mean \mu is defined as:  \begin{equation} \label{gaussformula} \mathcal{N}(x, \mu,\sigma) = \frac{1}{ \sigma \sqrt{ 2\pi } } e^{ -\frac{ (x – \mu)^2 }{ 2\sigma^2 } } \end{equation}

We want to know what happens when you multiply two Gaussian curves together. The blue curve below represents the (unnormalized) intersection of the two Gaussian populations:

![Image 40: Multiplying Gaussians](https://www.bzarg.com/wp-content/uploads/2015/08/gauss_joint.png)

\begin{equation} \label{gaussequiv} \mathcal{N}(x, \color{fuchsia}{\mu_0}, \color{deeppink}{\sigma_0}) \cdot \mathcal{N}(x, \color{yellowgreen}{\mu_1}, \color{mediumaquamarine}{\sigma_1}) \stackrel{?}{=} \mathcal{N}(x, \color{royalblue}{\mu’}, \color{mediumblue}{\sigma’}) \end{equation}

You can substitute equation \eqref{gaussformula} into equation \eqref{gaussequiv} and do some algebra (being careful to renormalize, so that the total probability is 1) to obtain:  \begin{equation} \label{fusionformula} \begin{aligned} \color{royalblue}{\mu’} &= \mu_0 + \frac{\sigma_0^2 (\mu_1 – \mu_0)} {\sigma_0^2 + \sigma_1^2}\\ \color{mediumblue}{\sigma’}^2 &= \sigma_0^2 – \frac{\sigma_0^4} {\sigma_0^2 + \sigma_1^2} \end{aligned} \end{equation}

We can simplify by factoring out a little piece and calling it \color{purple}{\mathbf{k}}:  \begin{equation} \label{gainformula} \color{purple}{\mathbf{k}} = \frac{\sigma_0^2}{\sigma_0^2 + \sigma_1^2} \end{equation}

 \begin{equation} \begin{split} \color{royalblue}{\mu’} &= \mu_0 + &\color{purple}{\mathbf{k}} (\mu_1 – \mu_0)\\ \color{mediumblue}{\sigma’}^2 &= \sigma_0^2 – &\color{purple}{\mathbf{k}} \sigma_0^2 \end{split} \label{update} \end{equation} 
Take note of how you can take your previous estimate and **add something** to make a new estimate. And look at how simple that formula is!

But what about a matrix version? Well, let’s just re-write equations \eqref{gainformula} and \eqref{update} in matrix form. If \Sigma is the covariance matrix of a Gaussian blob, and \vec{\mu} its mean along each axis, then:  \begin{equation} \label{matrixgain} \color{purple}{\mathbf{K}} = \Sigma_0 (\Sigma_0 + \Sigma_1)^{-1} \end{equation}

 \begin{equation} \begin{split} \color{royalblue}{\vec{\mu}’} &= \vec{\mu_0} + &\color{purple}{\mathbf{K}} (\vec{\mu_1} – \vec{\mu_0})\\ \color{mediumblue}{\Sigma’} &= \Sigma_0 – &\color{purple}{\mathbf{K}} \Sigma_0 \end{split} \label{matrixupdate} \end{equation} 
\color{purple}{\mathbf{K}} is a matrix called the **Kalman gain**, and we’ll use it in just a moment.

Easy! We’re almost finished!

# Putting it all together

We have two distributions: The predicted measurement with  (\color{fuchsia}{\mu_0}, \color{deeppink}{\Sigma_0}) = (\color{fuchsia}{\mathbf{H}_k \mathbf{\hat{x}}_k}, \color{deeppink}{\mathbf{H}_k \mathbf{P}_k \mathbf{H}_k^T}) , and the observed measurement with  (\color{yellowgreen}{\mu_1}, \color{mediumaquamarine}{\Sigma_1}) = (\color{yellowgreen}{\vec{\mathbf{z}_k}}, \color{mediumaquamarine}{\mathbf{R}_k}). We can just plug these into equation \eqref{matrixupdate} to find their overlap:  \begin{equation} \begin{aligned} \mathbf{H}_k \color{royalblue}{\mathbf{\hat{x}}_k’} &= \color{fuchsia}{\mathbf{H}_k \mathbf{\hat{x}}_k} & + & \color{purple}{\mathbf{K}} ( \color{yellowgreen}{\vec{\mathbf{z}_k}} – \color{fuchsia}{\mathbf{H}_k \mathbf{\hat{x}}_k} ) \\ \mathbf{H}_k \color{royalblue}{\mathbf{P}_k’} \mathbf{H}_k^T &= \color{deeppink}{\mathbf{H}_k \mathbf{P}_k \mathbf{H}_k^T} & – & \color{purple}{\mathbf{K}} \color{deeppink}{\mathbf{H}_k \mathbf{P}_k \mathbf{H}_k^T} \end{aligned} \label {kalunsimplified} \end{equation}

 And from \eqref{matrixgain}, the Kalman gain is:  \begin{equation} \label{eq:kalgainunsimplified} \color{purple}{\mathbf{K}} = \color{deeppink}{\mathbf{H}_k \mathbf{P}_k \mathbf{H}_k^T} ( \color{deeppink}{\mathbf{H}_k \mathbf{P}_k \mathbf{H}_k^T} + \color{mediumaquamarine}{\mathbf{R}_k})^{-1} \end{equation}  We can knock an \mathbf{H}_k off the front of every term in \eqref{kalunsimplified} and \eqref{eq:kalgainunsimplified} (note that one is hiding inside \color{purple}{\mathbf{K}} ), and an \mathbf{H}_k^T off the end of all terms in the equation for \color{royalblue}{\mathbf{P}_k’}.  \begin{equation} \begin{split} \color{royalblue}{\mathbf{\hat{x}}_k’} &= \color{fuchsia}{\mathbf{\hat{x}}_k} & + & \color{purple}{\mathbf{K}’} ( \color{yellowgreen}{\vec{\mathbf{z}_k}} – \color{fuchsia}{\mathbf{H}_k \mathbf{\hat{x}}_k} ) \\ \color{royalblue}{\mathbf{P}_k’} &= \color{deeppink}{\mathbf{P}_k} & – & \color{purple}{\mathbf{K}’} \color{deeppink}{\mathbf{H}_k \mathbf{P}_k} \end{split} \label{kalupdatefull} \end{equation}  \begin{equation} \color{purple}{\mathbf{K}’} = \color{deeppink}{\mathbf{P}_k \mathbf{H}_k^T} ( \color{deeppink}{\mathbf{H}_k \mathbf{P}_k \mathbf{H}_k^T} + \color{mediumaquamarine}{\mathbf{R}_k})^{-1} \label{kalgainfull} \end{equation}  …giving us the complete equations for the **update step.**
And that’s it! \color{royalblue}{\mathbf{\hat{x}}_k’} is our new best estimate, and we can go on and feed it (along with  \color{royalblue}{\mathbf{P}_k’}  ) back into another round of **predict**or **update** as many times as we like.

[![Image 41: Kalman filter information flow diagram](https://www.bzarg.com/wp-content/uploads/2015/08/kalflow.png)](https://www.bzarg.com/wp-content/uploads/2015/08/kalflow.png)

# Wrapping up

Of all the math above, all you need to implement are equations \eqref{kalpredictfull}, \eqref{kalupdatefull}, and \eqref{kalgainfull}. (Or if you forget those, you could re-derive everything from equations \eqref{covident} and \eqref{matrixupdate}.)

This will allow you to model any linear system accurately. For nonlinear systems, we use the **extended Kalman filter**, which works by simply linearizing the predictions and measurements about their mean. (I may do a second write-up on the EKF in the future).

If I’ve done my job well, hopefully someone else out there will realize how cool these things are and come up with an unexpected new place to put them into action.

* * *

Some credit and referral should be given to [this fine document](http://www.cl.cam.ac.uk/~rmf25/papers/Understanding%20the%20Basis%20of%20the%20Kalman%20Filter.pdf), which uses a similar approach involving overlapping Gaussians. More in-depth derivations can be found there, for the curious.

 This entry was posted in [Mini-courses](https://www.bzarg.com/p/category/mini-courses/), [Programming](https://www.bzarg.com/p/category/programming/) on [August 11, 2015](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/ "7:20 am") by [tbabb](https://www.bzarg.com/p/author/tr-babbgmail-com/ "View all posts by tbabb"). 
### Post navigation

[← How to pronounce hexadecimal](https://www.bzarg.com/p/how-to-pronounce-hexadecimal/)[Second Order FizzBuzz →](https://www.bzarg.com/p/second-order-fizzbuzz/)

## 361 thoughts on “How a Kalman filter works, in pictures”

1.   ![Image 42](https://secure.gravatar.com/avatar/ed28e4ea9d7c7c8d4c84d798b4a752e26890e490a4051b9ed8444ce74e185321?s=44&d=mm&r=g)**Valen**[August 11, 2015 at 5:51 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-782)
Great article! Loving your other posts as well.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=782#respond)↓ 
    1.   ![Image 43](https://secure.gravatar.com/avatar/f1a420650f1087666d5cb7a57bb26f96f8de3d33aa619328f4241c1179920c6f?s=44&d=mm&r=g)**AKM Sabbir**[February 28, 2017 at 4:19 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1009)
it seems its linear time dependent model. is it possible to introduce nonlinearity. what if the transformation is not linear. then how do you approximate the non linearity. every state represents the parametric form of a distribution. that means the actual state need to be sampled. is not it an expensive process?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1009#respond)↓ 
        1.   ![Image 44](https://secure.gravatar.com/avatar/f1a420650f1087666d5cb7a57bb26f96f8de3d33aa619328f4241c1179920c6f?s=44&d=mm&r=g)**AKM Sabbir**[February 28, 2017 at 4:22 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1010)
i am sorry u mentioned Extended Kalman Filter. i apologize, i missed the last part. great write up. i really loved it.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1010#respond)↓ 
            1.   ![Image 45](https://secure.gravatar.com/avatar/2d8a6b679ef1c210e43c3826135bd25b2789191aba6397358d32401009beede0?s=44&d=mm&r=g)**r00bi**[October 12, 2019 at 12:37 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1196)
Thanks, it was a nice article!

 How can I plot the uncertainty surrounding each point (mean) in python?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1196#respond)↓ 
                1.   ![Image 46](https://secure.gravatar.com/avatar/2096de34a6d588123e753d9b1df086bff78cbbe8df006f2c88fca7d9ad67b563?s=44&d=mm&r=g)**James**[January 15, 2020 at 12:59 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1206)
I find drawing ellipses helps me visualize it nicely.

For a quick-and-dirty plot, you can treat each row (or column) of the covariance matrix as a vector and plot out linear combinations of the two using sine and cosine. So given covariance matrix and mean

 M = [m11, m12; m21, m22]

 u = [u1; u2]

 your x and y values would be

 x = u1 + m11 * cos(theta) + m12 * sin(theta)

 y = u2 + m21 * cos(theta) + m22 * sin(theta)

 Just sweep theta from 0 to 2pi and you’ve got an ellipse!

For a more in-depth approach check out this link:

[https://www.visiondummy.com/2014/04/draw-error-ellipse-representing-covariance-matrix/](https://www.visiondummy.com/2014/04/draw-error-ellipse-representing-covariance-matrix/)

 

        2.   ![Image 47](https://secure.gravatar.com/avatar/cb377172eb73ebe1e7ac6ac82fb438ef238672258f573edb8cc10cfcaa57d2b9?s=44&d=mm&r=g)**wangjiangjiang**[December 20, 2019 at 1:27 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1204)
Have you written an introduction to extended Kalman filtering?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1204#respond)↓ 
        3.   ![Image 48](https://secure.gravatar.com/avatar/2871694e046c5f64a88c257bbf4c23ec9229783de70848b83ffb436792bf219a?s=44&d=mm&r=g)**cgeorges**[May 19, 2025 at 4:35 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1287)
Excellent explanation.

One thing, I believe that in the equation before equation (2), instead of:

 p_k = p_(k−1) + Δt

 v_k = v_(k−1)

 Should be

 p_k = p_(k−1) + v_(k−1) * Δt

 v_k = v_(k−1)

Equation (2) is correct though.

Once again, this is a beautiful and very intuitive explanation, and an example well chosen.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1287#respond)↓ 

    2.   ![Image 49](https://secure.gravatar.com/avatar/43f728a40af3cb46fa04d42141344e3b96c61c069197b86e8898d9edf089213c?s=44&d=mm&r=g)**Beiming**[November 19, 2017 at 2:15 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1103)
now I understood，you are greate!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1103#respond)↓ 
    3.   ![Image 50](https://secure.gravatar.com/avatar/140a629d16135a8a803d3838a27c954927a4257dd9edd7e222532d09daedd56d?s=44&d=mm&r=g)**Yubiao Zhang**[June 5, 2021 at 7:12 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1243)
Definitely love it!!!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1243#respond)↓ 

2.   ![Image 51](https://secure.gravatar.com/avatar/01fa201ee89e70dfbacb45959c6e294de7ba83134752ccb9936ff95af74b221f?s=44&d=mm&r=g)**[Camilla](http://winterflower.github.io/)**[August 11, 2015 at 8:42 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-783)
Wow! This article is amazing. Thank you very much for putting in the time and effort to produce this.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=783#respond)↓ 
    1.   ![Image 52](https://secure.gravatar.com/avatar/4813d7d8b3e6ebcfc01f313e5e83c99a30237366daffe26e1fe64030b61d7924?s=44&d=mm&r=g)**Davi**[January 4, 2017 at 10:06 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-983)
Thank you very much!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=983#respond)↓ 

3.   ![Image 53](https://secure.gravatar.com/avatar/58b476c88368cff442854aa63a6668cb227179875c5c3f8801b9e6ced26424f5?s=44&d=mm&r=g)**george**[August 11, 2015 at 9:34 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-784)
This is a nice and straight forward explanation .

 Thanks.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=784#respond)↓ 
    1.   ![Image 54](https://secure.gravatar.com/avatar/894ab032298793de6521b48b515e83076953c6ae8ac5329eb16a982785ce82e0?s=44&d=mm&r=g)**sobhan**[January 5, 2016 at 3:04 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-859)
I do agree…that is so great and I find it interesting and I will do it in other places ……and mention your name dude……….thanks a lot.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=859#respond)↓ 

4.   ![Image 55](https://secure.gravatar.com/avatar/4b9f71f4150b26adccf23c94ba6d5abc4f04fedcf4a30bf34d012e55aea48569?s=44&d=mm&r=g)**Justin**[August 11, 2015 at 9:35 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-785)
Hey Tim what did you use to draw this illustration?

[https://www.bzarg.com/wp-content/uploads/2015/08/kalflow.png](https://www.bzarg.com/wp-content/uploads/2015/08/kalflow.png)

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=785#respond)↓ 
    1.   ![Image 56](https://secure.gravatar.com/avatar/04bacec2489854dc64f60162c989d2bc5f48720522d85c2166c90328460746e5?s=44&d=mm&r=g)**tbabb**Post author[August 13, 2015 at 12:07 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-806)
All the illustrations are done primarily with Photoshop and a stylus.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=806#respond)↓ 
        1.   ![Image 57](https://secure.gravatar.com/avatar/099e6863285ffccafefa13aee63edeb1c5902d76cb9defd78737e56cf39f30d7?s=44&d=mm&r=g)**Lat Low**[July 25, 2020 at 1:51 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1222)
Did you use stylus on screen like iPad or Surface Pro or a drawing tablet like Wacom?

The reason I ask is that latency is still an issue here.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1222#respond)↓ 

5.   ![Image 58](https://secure.gravatar.com/avatar/3cab8484af0b16cb80cc4ff4849833e9a66d44730ebd5e28f364997c17664d46?s=44&d=mm&r=g)**[Philip Tellis](http://tech.bluesmoon.info/)**[August 11, 2015 at 10:30 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-786)
Nice explanation. Looks like someone wrote a Kalman filter implementation in Julia: [https://github.com/wkearn/Kalman.jl](https://github.com/wkearn/Kalman.jl)

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=786#respond)↓ 
6.   ![Image 59](https://secure.gravatar.com/avatar/ba087d87307282371bc79d064101711acfb65ec0711263596a36a870115a8084?s=44&d=mm&r=g)**[Paul Masurel](http://fulmicoton.com/)**[August 11, 2015 at 11:22 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-787)
Great post! Keep up the good work!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=787#respond)↓ 
7.   ![Image 60](https://secure.gravatar.com/avatar/df49904dd23b03a5f57d9d53c0bf9fb6f69a14fac075c98f54f26cf1ce960794?s=44&d=mm&r=g)**Ben Jackson**[August 12, 2015 at 12:10 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-788)
Nice work! I literally just drew half of those covariance diagrams on a whiteboard for someone. Now I can just direct everyone to your page.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=788#respond)↓ 
8.   ![Image 61](https://secure.gravatar.com/avatar/dc65c31249b509d5ddcb3c5f61dc6ed0c0f966cb94564a3955b44e1e60ae2678?s=44&d=mm&r=g)**Maxime Caron**[August 12, 2015 at 12:10 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-789)
Great post. Keep up the good work! I am hoping for the Extended Kalman filter soon.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=789#respond)↓ 
9.   ![Image 62](https://secure.gravatar.com/avatar/d47b5cbc456086a721c135754255cb27a2106e61034701764ffbd8295ece928b?s=44&d=mm&r=g)**Sebastian**[August 12, 2015 at 1:49 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-790)
What happens if your sensors only measure one of the state variables. Do you just make the H matrix to drop the rows you don’t have sensor data for and it all works out?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=790#respond)↓ 
    1.   ![Image 63](https://secure.gravatar.com/avatar/615bbea7ac842fb51fa2091b2e85a6d7eebd64bd297ca3ba81df6276c8fd78ef?s=44&d=mm&r=g)**Raj Samant**[December 12, 2015 at 5:22 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-855)
You reduce the rank of H matrix, omitting row will not make Hx multiplication possible. If in above example only position is measured state u make H = [1 0; 0 0]. If both are measurable then u make H = [1 0; 0 1];

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=855#respond)↓ 

10.   ![Image 64](https://secure.gravatar.com/avatar/0f7dff4c38e42c07c99020809a5e10dacead744249d804e90d59a07a9a4fa3e3?s=44&d=mm&r=g)**Jim Hejl**[August 12, 2015 at 2:09 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-791)
great write up! Thx!!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=791#respond)↓ 
11.   ![Image 65](https://secure.gravatar.com/avatar/5aa26a2d6df0f33b613de3087e842fd191f49dde1b125fc389ebe7d7cecedb6f?s=44&d=mm&r=g)**John Shea**[August 12, 2015 at 2:19 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-792)
Very nice, but are you missing squares on those variances in (1)?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=792#respond)↓ 
    1.   ![Image 66](https://secure.gravatar.com/avatar/11babc58eadcbdb2875c6e8ce9c41c819e925189cfe276554c5eb72107355114?s=44&d=mm&r=g)**Santanu Dutt**[December 28, 2016 at 11:55 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-982)
Thanks a lot for this wonderfully illuminating article. Like many others who have replied, this too was the first time I got to understand what the Kalman Filter does and how it does it. Thanks a lot

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=982#respond)↓ 

12.   ![Image 67](https://secure.gravatar.com/avatar/59afa31455c4683c34d49005baad4470c301e5a5857844274b0efeec3b260c9b?s=44&d=mm&r=g)**[Ilya Kavalerov](http://ww.ilyakavalerov.com/)**[August 12, 2015 at 2:34 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-793)
Nice post!

Near ‘You can use a Kalman filter in any place where you have uncertain information’ shouldn’t there be a caveat that the ‘dynamic system’ obeys the [markov property](https://en.wikipedia.org/wiki/Markov_property)? I.e. a process where given the present, the future is independent of the past (not true in financial data for example).

Also just curious, why no references to hidden markov models, the Kalman filter’s discrete (and simpler) cousin?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=793#respond)↓ 
    1.   ![Image 68](https://secure.gravatar.com/avatar/9c828f262508c110037e16f74c9decf766c5f5b209326c93cc6ffad85172b2c4?s=44&d=mm&r=g)**[Jan Galkowski](http://hypergeometric.wordpress.com/)**[August 12, 2015 at 2:10 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-800)
Don’t know if this question was answered, but, yes, there is a Markovian assumption in the model, as well as an assumption of linearity. But, at least in my technical opinion, that sounds much more restrictive than it actually is in practice. If the system (or “plant”) changes its internal “state” smoothly, the linearization of the Kalman is nothing more than using a local Taylor expansion of that state behavior, and, to some degree, a faster rate of change can be compensated for by increasing sampling rate. As far as the Markovian assumption goes, I think most models which are not Markovian can be transformed into alternate models which are Markovian, using a change in variables and such.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=800#respond)↓ 

13.   ![Image 69](https://secure.gravatar.com/avatar/4aafa6c6d228c81bd0895e7f49c26c24a0875fe9482062fe7a00300a983cf15e?s=44&d=mm&r=g)**tom**[August 12, 2015 at 3:24 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-794)
Awesome post! I’m impressed.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=794#respond)↓ 
14.   ![Image 70](https://secure.gravatar.com/avatar/1eb9cb031e4669206c25dec4ac8bdded57a52229d9dba5f9831dbc770af690eb?s=44&d=mm&r=g)**Kalen**[August 12, 2015 at 5:57 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-795)
Aaaargh!

 I wish I’d known about these filters a couple years back – they would have helped me solve an embedded control problem with lots of measurement uncertainty.

Thanks for the great post!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=795#respond)↓ 
15.   ![Image 71](https://secure.gravatar.com/avatar/bdbb331edd09624532db40838f8a9b144cb7118167cca6d5591df9a90732a482?s=44&d=mm&r=g)**[Mike McRoberts](http://thearduinoguy.org/)**[August 12, 2015 at 7:33 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-796)
Great article and very informative. Love the use of graphics. I would love to see another on the ‘extended Kalman filter’.

Thanks,

Mike

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=796#respond)↓ 
    1.   ![Image 72](https://secure.gravatar.com/avatar/45a06c7ae65fc81ed0ec40077238d730fe65fe235fb3170dfb4e263e1cdad427?s=44&d=mm&r=g)**[Yola](http://maiachia.blogspot.com/)**[February 26, 2018 at 10:23 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1146)
The same here! And i agree the post is clear to read and understand. Thanks to the author!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1146#respond)↓ 

16.   ![Image 73](https://secure.gravatar.com/avatar/4090afbbab857ef4f0d538d9ac87cc49a3f2cf607950b60e36fdd8b97c3eae1d?s=44&d=mm&r=g)**Pedrow**[August 12, 2015 at 10:54 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-797)
Great article, thanks!

It would be great if you could repeat all the definitions just after equations (18) and (19) – I found myself constantly scrolling up & down because I couldn’t remember what z was, etc. etc.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=797#respond)↓ 
17.   ![Image 74](https://secure.gravatar.com/avatar/a4b1df28c12c6b1d85fd893fd76d6444f912ccea1e6cd1b20bdf742a348beddb?s=44&d=mm&r=g)**Greg Yaks**[August 12, 2015 at 12:20 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-798)
Just before equation (2), the kinematics part, shouldn’t the first equation be about p_k rather than x_k, i.e., position and not the state?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=798#respond)↓ 
18.   ![Image 75](https://secure.gravatar.com/avatar/4bcad805040d910fb2c5fc9fdc9ebe7232b6b42445dd5ea605f831eb8a6bc43c?s=44&d=mm&r=g)**santaraxita**[August 12, 2015 at 9:10 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-801)
This is an excellent piece of pedagogy. Every step in the exposition seems natural and reasonable. I just chanced upon this post having the vaguest idea about Kalman filters but now I can pretty much derive it. The only thing I have to ask is whether the control matrix/vector must come from the second order terms of the taylor expansion or is that a pedagogical choice you made as an instance of external influence? Also, I guess in general your prediction matrices can come from a one-parameter group of diffeomorphisms.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=801#respond)↓ 
    1.   ![Image 76](https://secure.gravatar.com/avatar/04bacec2489854dc64f60162c989d2bc5f48720522d85c2166c90328460746e5?s=44&d=mm&r=g)**tbabb**Post author[August 13, 2015 at 12:09 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-807)
Nope, using acceleration was just a pedagogical choice since the example was using kinematics. The control matrix need not be a higher order Taylor term; just a way to mix “environment” state into the system state.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=807#respond)↓ 

19.   ![Image 77](https://secure.gravatar.com/avatar/88fdd5067658e965a4030bb424887a81b149da39d683e80ea1471f395edc08a7?s=44&d=mm&r=g)**[Jai](http://www.jaichaudhary.com/)**[August 12, 2015 at 9:30 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-802)
I wish there were more posts like this. That explain how amazing and simple ideas are represented by scary symbols. Loved the approach. Can you please do one on Gibbs Sampling/Metropolis Hastings Algorithm as well?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=802#respond)↓ 
    1.   ![Image 78](https://secure.gravatar.com/avatar/bc3bdbb93ec4c0423b7505f0b1562fb968f6de9a438338f0281336f764b05dfd?s=44&d=mm&r=g)**Yong**[March 1, 2026 at 7:43 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1291)
What if there are no overlap between actual sensor reading and our estimation? Is kalman filter still mathematically working? and do we need to change the covariances in the kalman gain in this case?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1291#respond)↓ 

20.   ![Image 79](https://secure.gravatar.com/avatar/7f3fc595f5da20451c1e66946e5926a1c80c9c572f2c4de51e0b996690d9d2f6?s=44&d=mm&r=g)**[Eric O. LEBIGOT](https://fr.linkedin.com/in/eolebigot)**[August 12, 2015 at 10:31 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-803)
Very nice write up! The use of colors in the equations and drawings is useful.

Small nitpick: an early graph that shows the uncertainties on x should say that sigma is the _standard deviation_, not the “variance”.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=803#respond)↓ 
    1.   ![Image 80](https://secure.gravatar.com/avatar/04bacec2489854dc64f60162c989d2bc5f48720522d85c2166c90328460746e5?s=44&d=mm&r=g)**tbabb**Post author[August 12, 2015 at 11:12 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-804)
@Eric Lebigot: Ah, yes, the diagram is missing a ‘squared’ on the sigma symbols. I’ll fix that when I next have access to the source file for that image.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=804#respond)↓ 

21.   ![Image 81](https://secure.gravatar.com/avatar/4b4c7ef46b6f3167352df59effaab40bd2e0c7e318220601471fcf03ad56fc8d?s=44&d=mm&r=g)**Nico Galoppo**[August 12, 2015 at 11:34 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-805)
Eye opening. The only part I didn’t follow in the derivation, is where the left hand side of (16) came from… until I realized that you defined x’_k and P’_k in the true state space coordinate system, not in the measurement coordinate system – hence the use of H_k!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=805#respond)↓ 
    1.   ![Image 82](https://secure.gravatar.com/avatar/12b7ceb054b5892c3a8a3d98e78d292814b2976c5fc5efa261ea092e91d230f1?s=44&d=mm&r=g)**Ha Song Son**[July 15, 2020 at 10:19 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1220)
same question! i dont understand this point too.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1220#respond)↓ 

22.   ![Image 83](https://secure.gravatar.com/avatar/476c1afe7bb3dc0b712c2ea0bd0cbbe6ddceae7ad80288d12870892ca2fa9829?s=44&d=mm&r=g)**Antti**[August 13, 2015 at 6:19 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-808)
Hmm, I didn’t think this through yet, but don’t you need to have a pretty good initial guess for your orientation (in the video example) in order for the future estimates to be accurate? Please show this is not so :)

Great illustration and nice work! Thanks!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=808#respond)↓ 
    1.   ![Image 84](https://secure.gravatar.com/avatar/476c1afe7bb3dc0b712c2ea0bd0cbbe6ddceae7ad80288d12870892ca2fa9829?s=44&d=mm&r=g)**Antti**[August 13, 2015 at 6:21 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-809)
(Or is it all “hidden” in the “velocity constrains acceleration” information?)

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=809#respond)↓ 
        1.   ![Image 85](https://secure.gravatar.com/avatar/04bacec2489854dc64f60162c989d2bc5f48720522d85c2166c90328460746e5?s=44&d=mm&r=g)**tbabb**Post author[August 13, 2015 at 6:56 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-810)
The Kalman filter is quite good at converging on an accurate state from a poor initial guess. Representing the uncertainty accurately will help attain convergence more quickly– if your initial guess overstates its confidence, the filter may take awhile before it begins to “trust” the sensor readings instead.

In the linked video, the initial orientation is completely random, if I recall correctly. I think it actually converges quite a bit before the first frame even renders. :)

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=810#respond)↓ 

23.   ![Image 86](https://secure.gravatar.com/avatar/d70dccf6c23b2e798e13e26a6ae179b12fd5203c1cf241537c415601b42f3721?s=44&d=mm&r=g)**[Dayne Batten](http://daynebatten.com/)**[August 13, 2015 at 12:32 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-811)
“The math for implementing the Kalman filter appears pretty scary and opaque in most places you find on Google.” Indeed. I’ve tried to puzzle my way through the Wikipedia explanation of Kalman filters on more than one occasion, and always gave up.

I was able to walk through your explanation with no trouble. Thank you.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=811#respond)↓ 
    1.   ![Image 87](https://secure.gravatar.com/avatar/cdadb313aa5de37afbc0c8bef2e7819829fc9c9f7b6ef39e519d779e86831eac?s=44&d=mm&r=g)**Ju**[August 24, 2015 at 2:39 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-832)
I’m a PhD student in economics and decided a while back to never ask Wikipedia for anything related to economics, statistics or mathematics because you will only leave feeling inadequate and confused. Seriously, concepts that I know and understand perfectly well look like egyptian hieroglyphs when I look at the wikipedia representation. I would ONLY look at the verbal description and introduction, the formulas seem to all be written by a wizard savant.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=832#respond)↓ 

24.   ![Image 88](https://secure.gravatar.com/avatar/5adbccd7abd6833640bcafd35acadec319821f21cb8371c47cc69af44ecc60ba?s=44&d=mm&r=g)**Alex Polotsk**[August 13, 2015 at 12:34 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-812)
The article has a perfect balance between intuition and math! This is the first time I actually understood Kalman filter. =)

I have a couple of questions.

The way we got second equation in (4) wasn’t easy for me to see until I manually computed it from the first equation in (4). Is it meant to be so, or did I missed a simple relation? When you say “I’ll just give you the identity”, what “identity” are you referring to? Are you referring to given equalities in (4)?

So, sensors produce:

 – observed noisy mean and covariance (z and R) we want to correct, and

 – an additional info ‘control vector’ (u) with known relation to our prediction.

 Correct?

Does H in (8) maps physical measurements (e.g. km/h) into raw data readings from sensors (e.g. uint32, as described in some accelerometer’s reference manual)?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=812#respond)↓ 
    1.   ![Image 89](https://secure.gravatar.com/avatar/04bacec2489854dc64f60162c989d2bc5f48720522d85c2166c90328460746e5?s=44&d=mm&r=g)**tbabb**Post author[August 13, 2015 at 7:13 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-815)
(4) was not meant to be derived by the reader; just given.

Z and R are sensor mean and covariance, yes. The control vector ‘u’ is generally not treated as related to the sensors (which are a transformation of the system state, not the environment), and are in some sense considered to be “certain”. For example, the commands issued to the motors in a robot are known exactly (though any uncertainty in the execution of that motion could be folded into the process covariance Q).

Yes, H maps the units of the state to any other scale, be they different physical units or sensor data units. I suppose you could transform the sensor measurements to a standard physical unit before it’s input to the Kalman filter and let H be the some permutation matrix, but you would have to be careful to transform your sensor covariance into that same space as well, and that’s basically what the Kalman filter is already doing for you by including a term for H. (That would also assume that all your sensors make orthogonal measurements, which not necessarily true in practice).

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=815#respond)↓ 
        1.   ![Image 90](https://secure.gravatar.com/avatar/4572c379bf9ba8fff750a0210fe157975410b275cb9f45c1057b3b77f8a5fcff?s=44&d=mm&r=g)**William Grand**[May 19, 2021 at 12:59 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1242)
A possible explanation for (4) may be this: [https://stats.stackexchange.com/a/498108/322199](https://stats.stackexchange.com/a/498108/322199)

 However, I still do not have an understanding of what APA^T is doing and how it is different from AP.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1242#respond)↓ 

25.   ![Image 91](https://secure.gravatar.com/avatar/4b4c7ef46b6f3167352df59effaab40bd2e0c7e318220601471fcf03ad56fc8d?s=44&d=mm&r=g)**Nico Galoppo**[August 13, 2015 at 4:39 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-814)
So what happens if you don’t have measurements for all DOFs in your state vector? I’m assuming that means that H_k isn’t square, in which case some of the derivation doesn’t hold, right? What do you do in that case?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=814#respond)↓ 
26.   ![Image 92](https://secure.gravatar.com/avatar/8a283736529ce683dc9024df4262f3d951515c40bb9df4afb25a0889f0f71722?s=44&d=mm&r=g)**Robert**[August 13, 2015 at 7:44 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-816)
Excellent explanation. Thanks!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=816#respond)↓ 
27.   ![Image 93](https://secure.gravatar.com/avatar/3aca06705d31bfe88c19970e353e03f6be7f552c2deed776ede5ac93c018f580?s=44&d=mm&r=g)**John Dabbar**[August 15, 2015 at 12:07 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-817)
Kalman filters are used in dynamic positioning systems for offshore oil drilling.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=817#respond)↓ 
28.   ![Image 94](https://secure.gravatar.com/avatar/2d1762fa606c3f865803c21ba7c9949f00a9d506c6c11aa23c8cfbeb7f028691?s=44&d=mm&r=g)**[Istvan Hajnal](http://allthingsdatascience.blogspot.be/)**[August 15, 2015 at 3:13 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-818)
Great write up. Very helpful. Thanks.

Just one question. Shouldn’t it be p_k in stead of x_k (and p_k-1 instead of x_k-1) in the equation right before equation (2)? Also, in (2), that’s the transpose of x_k-1, right?

 I guess the same thing applies to equation right before (6)?

Regards,

 Istvan Hajnal

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=818#respond)↓ 
    1.   ![Image 95](https://secure.gravatar.com/avatar/04bacec2489854dc64f60162c989d2bc5f48720522d85c2166c90328460746e5?s=44&d=mm&r=g)**tbabb**Post author[August 17, 2015 at 8:21 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-820)
Yes, my thinking was to make those kinematic equations look “familiar” by using x (and it would be understood where it came from), but perhaps the inconsistency is worse. :\

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=820#respond)↓ 

29.   ![Image 96](https://secure.gravatar.com/avatar/5ac4d0cae36fbde831bb219967d6abe44ee809f874afe6cabf908156f8b96125?s=44&d=mm&r=g)**Sourjya Sarkar**[August 17, 2015 at 2:30 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-819)
Great ! Really interesting and comprehensive to read.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=819#respond)↓ 
30.   ![Image 97](https://secure.gravatar.com/avatar/3ae10044358092cbba0fddbf667c0a6a8c688be4ea9d6df9e669ef3cbc92c289?s=44&d=mm&r=g)**Li**[August 18, 2015 at 5:28 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-822)
Thanks for the post, I have learnt a lot. My background is signal processing, pattern recognition.

One question:

If we have two probabilities and we want to know the chance that both are true, we just multiply them together.

Why not use sum or become Chi-square distribution?

Because from [http://math.stackexchange.com/questions/101062/is-the-product-of-two-gaussian-random-variables-also-a-gaussian](http://math.stackexchange.com/questions/101062/is-the-product-of-two-gaussian-random-variables-also-a-gaussian)

The product of two Gaussian random variables is distributed, in general, as a linear combination of two Chi-square random variables.

Thanks,

 Regards,

 Li

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=822#respond)↓ 
    1.   ![Image 98](https://secure.gravatar.com/avatar/04bacec2489854dc64f60162c989d2bc5f48720522d85c2166c90328460746e5?s=44&d=mm&r=g)**tbabb**Post author[August 20, 2015 at 6:48 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-826)
Ah, not quite. Let X and Y both be Gaussian distributed. We are not doing \text{pdf}(X \cdot Y), we are doing \text{pdf}(X) \cdot \text{pdf}(Y)!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=826#respond)↓ 
        1.   ![Image 99](https://secure.gravatar.com/avatar/0cdc2641fb5367d0d7e7d6ef51f79b6f56555f1176100401d76aa31c7a84e140?s=44&d=mm&r=g)**Peter**[June 21, 2017 at 8:41 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1054)
Hello, is there a reason why we multiply the two Gaussian pdfs together? I mean, why not add them up or do convolution or a weighted sum…etc?

And thanks for the great explanations of kalman filter in the post :)

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1054#respond)↓ 
            1.   ![Image 100](https://secure.gravatar.com/avatar/696a439875a84bf5018d92749d54a0d35a974ddbecad9248db1c940733fe10db?s=44&d=mm&r=g)**Hairuo**[March 27, 2018 at 10:22 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1156)
Here is a good explanation whey it is the product of two Gaussian PDF. Basically, it is due to Bayesian principle

[https://math.stackexchange.com/q/2630447](https://math.stackexchange.com/q/2630447)

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1156#respond)↓ 

31.   ![Image 101](https://secure.gravatar.com/avatar/51c07193f0eeedba6805e8d5bac5d464b79edc1b337d46068606cffa6bd98acf?s=44&d=mm&r=g)**Raphael Michel**[August 19, 2015 at 4:33 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-823)
Really interesting article. Clear and simple. Exactly what I needed.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=823#respond)↓ 
32.   ![Image 102](https://secure.gravatar.com/avatar/efdda28cecc401a0dc26778705bf19e7fcaaa065a1d366e212bac6e45e2064d8?s=44&d=mm&r=g)**Stephane**[August 20, 2015 at 6:23 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-824)
Thank you very much for this very clear article!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=824#respond)↓ 
33.   ![Image 103](https://secure.gravatar.com/avatar/2f86bf2c54a31d30c119cae04a7902e621ca12d07c3ac75e5ce2b0dec5b82343?s=44&d=mm&r=g)**Qu**[August 20, 2015 at 8:43 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-825)
Great post ! I have a question about fomula (7), How to get Qk genenrally ?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=825#respond)↓ 
34.   ![Image 104](https://secure.gravatar.com/avatar/032bdd6f2494e747194bc66d77b80c9fa800512f16ab81db8662e2ae6a3f5654?s=44&d=mm&r=g)**Prof. Vadlamani Ravi**[August 21, 2015 at 11:42 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-831)
Great post. It demystifies the Kalman filter in simple graphics. A great teaching aid. Thx.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=831#respond)↓ 
35.   ![Image 105](https://secure.gravatar.com/avatar/6b65b4722fe164a340af5596753d8d335ac50ba34ebe8f0c524259580672c8de?s=44&d=mm&r=g)**Chintan**[August 25, 2015 at 4:32 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-833)
Hello Tim,

Very nice article. I had read the signal processing article that you cite and had given up half way.

This article clears many things. I will now have to implement it myself.

It would be nice if you could write another article with an example or maybe provide Matlab or Python code.

Keep up the good work.

Best Regards

Chintan

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=833#respond)↓ 
36.   ![Image 106](https://secure.gravatar.com/avatar/f884ae0dd197efd1078fc6dfa115bbfe69d975a6d563bddeb1b21dd8fc16a8c0?s=44&d=mm&r=g)**Naseem Makiya**[August 26, 2015 at 3:49 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-834)
Awesome post!!! Great visuals and explanations.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=834#respond)↓ 
37.   ![Image 107](https://secure.gravatar.com/avatar/c8a2bbdf07f41b4e59de31ffcf584d7283a357850f27dd0090761390d207de12?s=44&d=mm&r=g)**Paul**[October 7, 2015 at 7:34 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-837)
Can you realy knock an Hk off the front of every term in (16) and (17) ?

 I think this operation is forbidden for this matrix.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=837#respond)↓ 
38.   ![Image 108](https://secure.gravatar.com/avatar/1ca277ef1d790558b7b0c7cfb07c5287e3f277c753b5c5cfee965b1f49c11bf3?s=44&d=mm&r=g)**Insik**[October 13, 2015 at 8:48 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-838)
Wow! This post is amazing. It really helps me to understand true meaning behind equations.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=838#respond)↓ 
39.   ![Image 109](https://secure.gravatar.com/avatar/3bfe0ba6efa7d70a1d6f70712c0e468e1b13f8af6784a16cdfa26b4594540d41?s=44&d=mm&r=g)**[rosie](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/)**[October 28, 2015 at 5:48 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-841)
This is simplyy awesum!!!! this demonstration has given our team a confidence to cope up with the assigned project

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=841#respond)↓ 
40.   ![Image 110](https://secure.gravatar.com/avatar/d15d4974fa254351acddefe384adb7fedb42f9824daa82010e935469b825ff51?s=44&d=mm&r=g)**Debo**[November 5, 2015 at 12:52 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-842)
Great post! Thanks

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=842#respond)↓ 
41.   ![Image 111](https://secure.gravatar.com/avatar/7fc352e02ff467d188b2500b005417108f3f704b183d4f6ede0ebcde1912b513?s=44&d=mm&r=g)**hec**[November 13, 2015 at 1:54 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-843)
Amazing article, I struggled over the textbook explanations. This article summed up 4 months of graduate lectures, and i finally know whats going on. Thank you.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=843#respond)↓ 
42.   ![Image 112](https://secure.gravatar.com/avatar/48ea3233cf95c1d5655c863790c0072038a8f363a9ef33d24e43a34bb36769ff?s=44&d=mm&r=g)**Nezih**[November 13, 2015 at 10:01 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-844)
Greta article, thank you!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=844#respond)↓ 
43.   ![Image 113](https://secure.gravatar.com/avatar/a2f94c9781c1ce690e552e48c042f3e692bde42c772dd9f7977a9c8b34c5bcff?s=44&d=mm&r=g)**Mel**[November 18, 2015 at 5:52 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-846)
Great work. Thanks!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=846#respond)↓ 
44.   ![Image 114](https://secure.gravatar.com/avatar/4ad3efb964d11adf43f4bfc9becc9340e8200698f1424cce7029aa392fa4c474?s=44&d=mm&r=g)**Jose Kurian**[November 19, 2015 at 1:26 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-847)
Hello,

This is indeed a great article. I have been trying to understand this filter for some time now. This article makes most of the steps involved in developing the filter clear.

I how ever did not understand equation 8 where you model the sensor. What does the parameter H do here. How do you obtain the components of H.

Thanks in advance,

Jose

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=847#respond)↓ 
45.   ![Image 115](https://secure.gravatar.com/avatar/544cd7f6bca0fa3c9a631f74127083ed96423d7e3705d31f14b3fb40643d85ec?s=44&d=mm&r=g)**carolinux**[November 30, 2015 at 1:13 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-848)
Very good job explaining and illustrating these! Now I understand how the Kalman gain equation is derived. It was hidden inside the properties of Gaussian probability distributions all along!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=848#respond)↓ 
46.   ![Image 116](https://secure.gravatar.com/avatar/006b2f0a4df80f1a2dff247c299315aedabccd10707e2622025fd4b231c9c471?s=44&d=mm&r=g)**Sam**[December 5, 2015 at 4:09 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-850)
This is the greatest explanation ever!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=850#respond)↓ 
47.   ![Image 117](https://secure.gravatar.com/avatar/92d5c9592ded39dec7ecdf8e40e9c6aa5f2bd67f0e5205f161ab783e339afa2c?s=44&d=mm&r=g)**Vidhya Venugopal**[December 10, 2015 at 1:37 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-851)
Great explanation! I have a question though just to clarify my understanding of Kalman Filtering. In the above example (position, velocity), we are providing a constant acceleration value ‘a’. Assuming this is a car example, let’s say the driver decides to change the acceleration during the trip. From what I understand of the filter, I would have to provide this value to my Kalman filter for it to calculated the predicted state every time I change the acceleration. Kalman filter would be able to “predict” the state without the information that the acceleration was changed. Is this correct? Also, would this be impractical in a real world situation, where I may not always be aware how much the control (input) changed?

 Can anyone help me with this?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=851#respond)↓ 
48.   ![Image 118](https://secure.gravatar.com/avatar/53884690b8c9fe196f3649966f719f615f64e9e718117b8310d525b51704582c?s=44&d=mm&r=g)**javad**[January 2, 2016 at 4:56 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-858)
you are the best Tim!

 thank you very much

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=858#respond)↓ 
49.   ![Image 119](https://secure.gravatar.com/avatar/a81557c8367981f90122ea11ec7390cdd61a0911e0f9d937ae8f1b28610de566?s=44&d=mm&r=g)**minh**[January 8, 2016 at 12:05 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-861)
hey, my kalman filter output is lagging the original signal. However it does a great job smoothing. How does lagging happen

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=861#respond)↓ 
50.   ![Image 120](https://secure.gravatar.com/avatar/8077e8a495b1a09c94fa5ab73926fe518adffce11e8f5b5c223152c678094a8b?s=44&d=mm&r=g)**Sujay**[January 21, 2016 at 7:23 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-863)
I must say the best link in the first page of google to understand Kalman filters. I guess I read around 5 documents and this is by far the best one. Well done and thanks!! cheers!! :D

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=863#respond)↓ 
51.   ![Image 121](https://secure.gravatar.com/avatar/25a5641635e3c20976bf1bf2acacf3c8b831656e07687115a64988a80904114c?s=44&d=mm&r=g)**Salman**[February 4, 2016 at 5:47 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-866)
Excellent explanation.

After reading many times about Kalman filter and giving up on numerous occasions because of the complex probability mathematics, this article certainly keeps you interested till the end when you realize that you just understood the entire concept.

Keep up the good work.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=866#respond)↓ 
52.   ![Image 122](https://secure.gravatar.com/avatar/02d8bcad50552457e98c9a75f6cf3b1621e8a3b644daf570fe409c88e16f83ca?s=44&d=mm&r=g)**Ben**[February 4, 2016 at 11:01 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-867)
Thank you for your excelent work!

 There is no doubt, this is the best tutorial about KF !

 Many thanks!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=867#respond)↓ 
53.   ![Image 123](https://secure.gravatar.com/avatar/f0c007480d481dc8fd7dfc6a57507cd758c7003f983af6ac94a4dad37dd29de9?s=44&d=mm&r=g)**William A**[February 17, 2016 at 9:23 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-869)
Great article ! Clear and easy to understand.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=869#respond)↓ 
54.   ![Image 124](https://secure.gravatar.com/avatar/cba8648d25d00103c595475bb1026a6f3bbb7f6e2663a6e392121f17d0d4d951?s=44&d=mm&r=g)**Paul**[February 24, 2016 at 12:40 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-870)
This is by far the best explanation of a Kalman filter I have seen yet. Very well done.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=870#respond)↓ 
55.   ![Image 125](https://secure.gravatar.com/avatar/ce86a3fa155de09686e0ce31e030b7635a5008e41b6c7df1a5f88160912bfe77?s=44&d=mm&r=g)**Baljit Kaur**[March 1, 2016 at 10:19 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-871)
v.nice explanation. Actually I have something different problem if you can provide a solution to me. In my system, I have starting and end position of a robot. I need to find angle if robot needs to rotate and velocity of a robot. Can I get solution that what will be Transition matrix, x(k-1), b(k), u(k).

 Thanks Baljit

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=871#respond)↓ 
56.   ![Image 126](https://secure.gravatar.com/avatar/35567c6f6ea9d38311b88ddfd3bf02d978450f08b13b05cb33c50faf60a7e986?s=44&d=mm&r=g)**Maneesha K**[March 20, 2016 at 11:40 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-874)
Such an amazing explanation of the much scary kalman filter. Kudos to the author. Thanks very much Sir. Expecting such explanation for EKF, UKF and Particle filter as well.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=874#respond)↓ 
    1.   ![Image 127](https://secure.gravatar.com/avatar/0eaca01dd3b58ee7e0e7e48b9f591c28d458fe77601ab56e3c7f99595dbfded8?s=44&d=mm&r=g)**Ali**[March 23, 2016 at 6:11 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-875)
Hello There!

Great article but I have a question. Why did you consider acceleration as external influance? Could we add the acceleration inside the F matrix directly e.g. x=[position, velocity, acceleration]’ ?

Thanks!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=875#respond)↓ 
        1.   ![Image 128](https://secure.gravatar.com/avatar/b163d338ba17317b314c26386ab7adebb8147c77baa2540548eb221cd7796238?s=44&d=mm&r=g)**Clive Myrie**[May 6, 2016 at 2:47 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-884)
I think that acceleration was considered an external influence because in real life applications acceleration is what the controller has (for lack of a better word) control of. In other words, acceleration and acceleration commands are how a controller influences a dynamic system.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=884#respond)↓ 

57.   ![Image 129](https://secure.gravatar.com/avatar/47f81c185939355a02f156a1a5976cd46bf119bc1e849ef6889f4b65fdcbecd9?s=44&d=mm&r=g)**Minh**[March 28, 2016 at 1:54 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-876)
Thank you so so much Tim. The math in most articles on Kalman Filtering looks pretty scary and obscure, but you make it so intuitive and accessible (and fun also, in my opinion). Again excellent job! Would you mind if I share part of the particles to my peers in the lab and maybe my students in problem sessions? I’ll certainly mention the source

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=876#respond)↓ 
58.   ![Image 130](https://secure.gravatar.com/avatar/c98122a85e056890613d5883bf520ad524c0911aa5c412174e51292ae29ceb12?s=44&d=mm&r=g)**Jeroen**[April 1, 2016 at 12:01 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-877)
Best explanation I’ve read so far on the Kalman filter. Far better than many textbooks. Thank you.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=877#respond)↓ 
59.   ![Image 131](https://secure.gravatar.com/avatar/224833d1b746f4d0ec5c3a8f71209053539ee70385deddd39f2592b5e48b809a?s=44&d=mm&r=g)**Graeme**[April 3, 2016 at 8:43 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-878)
Without doubt the best explanation of the Kalman filter I have come across! Often in DSP, learning materials begin with the mathematics and don’t give you the intuitive understanding of the problem you need to fully grasp the problem. This is a great resource. Thanks.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=878#respond)↓ 
60.   ![Image 132](https://secure.gravatar.com/avatar/f6d8053b6f527bfa1377a4a16e764d63f807fb64519558956b52d6fa4ad04929?s=44&d=mm&r=g)**vishwanath**[April 9, 2016 at 11:30 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-879)
amazing…simply simplified.you saved me a lot of time…thanks for the post.please update with nonlinear filters if possible that would be a great help.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=879#respond)↓ 
61.   ![Image 133](https://secure.gravatar.com/avatar/310285b432115f20f02c4664bd7f77e5566f0df8a4f61b162a03385762ad4659?s=44&d=mm&r=g)**Laurent Vosgien**[April 23, 2016 at 4:31 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-880)
Your original approach (is it ?) of combining Gaussian distributions to derive the Kalman filter gain is elegant and intuitive. All presentations of the Kalman filter that I have read use matrix algebra to derive the gain that minimizes the updated covariance matrix to come to the same result. That was satisfying enough to me up to a point but I felt i had to transform X and P to the measurement domain (using H) to be able to convince myself that the gain was just the barycenter between the a priori prediction distribution and the measurement distributions weighted by their covariances. This is where other articles confuse the reader by introducing Y and S which are the difference z-H*x called innovation and its covariance matrix. Then they have to call S a “residual” of covariance which blurs understanding of what the gain actually represents when expressed from P and S. Good job on that part !

I will be less pleasant for the rest of my comment, your article is misleading in the benefit versus effort required in developing an augmented model to implement the Kalman filter. By the time you invested the research and developing integrated models equations for errors of your sensors which is what the KF filter is about, not the the recursive algorithm principle presented here which is trivial by comparison.

There is nothing magic about the Kalman filter, if you expect it to give you miraculous results out of the box you are in for a big disappointment. By the time you have developed the level of understanding of your system errors propagation the Kalman filter is only 1% of the real work associated to get those models into motion. There is a continuous supply of serious failed Kalman Filters papers where greedy people expect to get something from nothing implement a EKF or UKF and the result are junk or poor. All because of article like yours give the false impression that understanding a couple of stochastic process principles and matrix algebra will give miraculous results. The work in not where you insinuate it is. Understanding the Kalman filter predict and update matrix equation is only opening a door but most people reading your article will think it’s the main part when it is only a small chapter out of 16 chapters that you need to master and 2 to 5% of the work required.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=880#respond)↓ 
62.   ![Image 134](https://secure.gravatar.com/avatar/2a6b0b165751cb1676174a7cc381a7847df49a07bc059bfca13328c1647d47d6?s=44&d=mm&r=g)**Byambajav**[April 27, 2016 at 11:27 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-881)
Great article I’ve ever been reading on subject of Kalman filtering. Thanks !!!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=881#respond)↓ 
63.   ![Image 135](https://secure.gravatar.com/avatar/1d3b51ad4798b9982ed95b87eae1a7d02ae6feaede5483c0751f7d25c0406f43?s=44&d=mm&r=g)**Edu**[April 28, 2016 at 10:58 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-882)
fantastic | thanks for the outstanding post !

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=882#respond)↓ 
64.   ![Image 136](https://secure.gravatar.com/avatar/43a6ba4e550bfca9c095008d1c9403500be1610967bc07a193004630e2653dd2?s=44&d=mm&r=g)**Wanjohi**[May 5, 2016 at 9:54 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-883)
First time am getting this stuff…..it doesn’t sound Greek and Chinese…..greekochinese…..

 on point….and very good work…..

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=883#respond)↓ 
65.   ![Image 137](https://secure.gravatar.com/avatar/73bf0b9b9467aabf8a64db006fd860eb5bb7b155ee17ff3ca1242ffb5b88d214?s=44&d=mm&r=g)**Mohamad**[May 8, 2016 at 2:32 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-885)
thank you Tim for your informative post, I did enjoy when I was reading it, very easy and logic… good job

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=885#respond)↓ 
66.   ![Image 138](https://secure.gravatar.com/avatar/ee4784a060d507114009689e7f0bf971aef951d6abd57c624f525e92f127b5d0?s=44&d=mm&r=g)**Kurt Ramsdale**[May 11, 2016 at 5:08 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-886)
Equation 18 (measurement variable) is wrong.

 Equation 16 is right. Divide all by H.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=886#respond)↓ 
    1.   ![Image 139](https://secure.gravatar.com/avatar/04bacec2489854dc64f60162c989d2bc5f48720522d85c2166c90328460746e5?s=44&d=mm&r=g)**tbabb**Post author[May 11, 2016 at 5:43 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-887)
What’s the issue? Note that K has a leading H_k inside of it, which is knocked off to make K’.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=887#respond)↓ 

67.   ![Image 140](https://secure.gravatar.com/avatar/ee4784a060d507114009689e7f0bf971aef951d6abd57c624f525e92f127b5d0?s=44&d=mm&r=g)**Kurt Ramsdale**[May 11, 2016 at 8:23 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-888)
x has the units of the state variables.

 z has the units of the measurement variables.

 K is unitless 0-1.

 The units don’t work unless the right term is K(z/H-x).

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=888#respond)↓ 
68.   ![Image 141](https://secure.gravatar.com/avatar/425e524a53b6a78c37d1f723dec1689f95769731046ffa2758b438cfc38b13aa?s=44&d=mm&r=g)**Mehdi**[May 11, 2016 at 12:06 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-889)
Excellent Post! Kalman Filter has found applications in so diverse fields. A great one to mention is as a online learning algorithm for Artificial Neural Networks.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=889#respond)↓ 
69.   ![Image 142](https://secure.gravatar.com/avatar/3abfdf909c7e60ac69036a834819b88fdafcca41e42697de11621e633a481c95?s=44&d=mm&r=g)**[vishnu](http://www.teninall.com/)**[May 12, 2016 at 10:21 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-890)
Great Article. Nicely articulated. Do you recommened any C++ or python implementation of kalman filter? I know there are many in google but your recommendation is not the same which i choose.

Assume that every car is connected to internet. I am trying to predict the movement of bunch of cars, where they probably going in next ,say 15 min. you can assume like 4 regions A,B,C,D (5-10km of radius) which are close to each other. How can I make use of kalman filter to predict and say, so many number cars have moved from A to B.

I am actullay having trouble with making the Covariance Matrix and Prediction Matrix. In my case I know only position. Veloctiy of the car is not reported to the cloud. So First step could be guessing the velocity from 2 consecutive position points, then forming velocity vector and position vector.Then applying your equations. Is my assumption is right? Thanks

P.S: sorry for the long comment.Need Help. Thanks

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=890#respond)↓ 
70.   ![Image 143](https://secure.gravatar.com/avatar/6ac33c3d6145d2e93f132b76055f6e42e4508cc91674d2984145e4bf0b518b4c?s=44&d=mm&r=g)**Ebrahim Mirzaei**[May 17, 2016 at 3:51 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-891)
Excellent Post! thanks alot.

 I want to use kalman Filter to auto correct 2m temperature NWP forecasts.

 Could you please help me to get a solution or code in R, FORTRAN or Linux Shell Scripts(bash,perl,csh,…) to do this.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=891#respond)↓ 
71.   ![Image 144](https://secure.gravatar.com/avatar/f88e7fc05a81aa1bb7878e8dd9484b2c9b2d606486fe0588b515105cf9bbdc96?s=44&d=mm&r=g)**omid**[May 20, 2016 at 8:24 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-892)
Hi

 I’m kinda new to this field and this document helped me a lot

 I just have one question and that is what is the value of the covariance matrix at the start of the process?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=892#respond)↓ 
72.   ![Image 145](https://secure.gravatar.com/avatar/4cb233dae4ed83febc57fe683053ed40334e23ef1d71c4a9f92d773d3a2c3da5?s=44&d=mm&r=g)**Will**[May 20, 2016 at 9:29 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-893)
This is the best article I’ve read on Kalman filter so far by a long mile!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=893#respond)↓ 
73.   ![Image 146](https://secure.gravatar.com/avatar/4cb233dae4ed83febc57fe683053ed40334e23ef1d71c4a9f92d773d3a2c3da5?s=44&d=mm&r=g)**Will**[May 20, 2016 at 9:32 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-894)
Btw, will there be an article on Extend Kalman Filter sometime in the future, soon hopefully?

Thanks! Great work

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=894#respond)↓ 
74.   ![Image 147](https://secure.gravatar.com/avatar/21ccfd8fa480ba17b0ba291773d124700c374924f16d9d95808a1c78629021fa?s=44&d=mm&r=g)**urwa**[May 22, 2016 at 1:52 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-895)
Thanks a bunch. :) Very helpful indeed

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=895#respond)↓ 
75.   ![Image 148](https://secure.gravatar.com/avatar/d580d17913cfd380353bc682a0aee66ecba6f5edbfae3da697331ea9d23eea1d?s=44&d=mm&r=g)**Sagar**[May 25, 2016 at 2:44 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-896)
Thanks a lot :D Great article!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=896#respond)↓ 
76.   ![Image 149](https://secure.gravatar.com/avatar/2dad4209202e328370aaf037f94c70d1632cd0c71e58f805d06ad28c46626910?s=44&d=mm&r=g)**Taz Walker**[May 31, 2016 at 2:24 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-900)
Awesome thanks! :)

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=900#respond)↓ 
77.   ![Image 150](https://secure.gravatar.com/avatar/8690fe5ddb10e4c5608b08b5ca1c31618c6dcfb61bd9033279cf9aa6a9ae980b?s=44&d=mm&r=g)**martin**[June 7, 2016 at 5:14 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-906)
My main interest in the filter is its significance to Dualities which you have not mentioned – pity

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=906#respond)↓ 
78.   ![Image 151](https://secure.gravatar.com/avatar/1751ef4dec7f1c08b4c3b770eddb3e23a6e458cad4cacfc5e8f99c46f4f36296?s=44&d=mm&r=g)**Matheus**[June 7, 2016 at 6:23 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-907)
Thank you for the really good work!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=907#respond)↓ 
79.   ![Image 152](https://secure.gravatar.com/avatar/71aeec980552c5032f3f8a940204e75028f2d39a0684aef7e57cef7e9618e30e?s=44&d=mm&r=g)**Colin**[June 11, 2016 at 10:26 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-908)
Excellent. Thank you.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=908#respond)↓ 
80.   ![Image 153](https://secure.gravatar.com/avatar/85dacf7f98bb666b1266dcae78e660d4bb94c9620af6e78d6d01b1a972b8a6cb?s=44&d=mm&r=g)**Chong**[June 22, 2016 at 2:41 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-909)
Excellent explanation! best I can find online for newbies! Pls do a similar one for UKF pls!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=909#respond)↓ 
81.   ![Image 154](https://secure.gravatar.com/avatar/d8529d8686eb06e5cd968f3d5473d9f3ec2b8e8b59bf6dac4c8ffcec1d838f15?s=44&d=mm&r=g)**[Manne](http://mindbend.se/)**[June 22, 2016 at 8:51 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-910)
This article completely fills every hole I had in my understanding of the kalman filter. Thank you so much!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=910#respond)↓ 
82.   ![Image 155](https://secure.gravatar.com/avatar/c38ea710b12666c2dde8756c61cdb8bc23912970f9d095c63eb48e095855c0f2?s=44&d=mm&r=g)**Nick**[June 26, 2016 at 5:39 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-911)
Pure Gold !

Thanks!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=911#respond)↓ 
83.   ![Image 156](https://secure.gravatar.com/avatar/2ad8e456d4a5ebbca08ce029db61a13a2c312b3dcd50c7497bd4982dcdc55cc7?s=44&d=mm&r=g)**Pallanti Srinivas Rao**[July 3, 2016 at 12:35 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-912)
Great work. The explanation is really very neat and clear.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=912#respond)↓ 
84.   ![Image 157](https://secure.gravatar.com/avatar/d38e038f54a7054705abe464dd26c136a27603f586b38c0401636d769ed6ec95?s=44&d=mm&r=g)**meow**[July 7, 2016 at 3:40 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-913)
RIP Rudolf E. Kálmán.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=913#respond)↓ 
85.   ![Image 158](https://secure.gravatar.com/avatar/f0af9214364dee91eed2cb7836a9afadbc472e8c139796011c5594ef390acf61?s=44&d=mm&r=g)**shikhil bhalla**[July 8, 2016 at 12:27 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-914)
Awsm work. kalman filter was not that easy before. Thanks a lot.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=914#respond)↓ 
86.   ![Image 159](https://secure.gravatar.com/avatar/3aff27de61324d9d7d04d4bc312ce676b11b8176c9493150aa3037bd2507a578?s=44&d=mm&r=g)**Zsolt Zseludek**[July 9, 2016 at 10:08 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-916)
Great article. I used this filter a few years ago in my embedded system, using code segments from net, but now I finally understand what I programmed before blindly :). Thanks.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=916#respond)↓ 
87.   ![Image 160](https://secure.gravatar.com/avatar/fedb95d80e08867a2951e9ec8fa4f8066fa8c5f22b2011ed3d5e2a514e26530f?s=44&d=mm&r=g)**MaheshAttade**[July 10, 2016 at 5:48 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-917)
PURE AWESOMENESS!

 Thanks.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=917#respond)↓ 
88.   ![Image 161](https://secure.gravatar.com/avatar/0ceee3388091834a8d5210e5f3c7c764e48f24d6e57fe1ed8ada4404d7beea6b?s=44&d=mm&r=g)**nancy wei**[July 12, 2016 at 3:52 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-919)
Amazing! Funny and clear! Thanks a lot! It definitely give me a lot of help!!!!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=919#respond)↓ 
89.   ![Image 162](https://secure.gravatar.com/avatar/f6072fb1650949bd872aee5f4be24ff48b9d4710f0a73558aaa49a90bbeb0e3a?s=44&d=mm&r=g)**ammar**[July 13, 2016 at 3:36 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-920)
very helpful thanks

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=920#respond)↓ 
90.   ![Image 163](https://secure.gravatar.com/avatar/ad9e7ce2e1d163693e51b2dc07f51392c5608644d16751bfc8dc4b85c8d8ff06?s=44&d=mm&r=g)**Trustmeimanengineer**[July 14, 2016 at 9:34 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-921)
This is great actually. Im studying electrial engineering (master). Ive read plenty of Kalman Filter explanations and derivations but they all kinda skip steps or forget to introduce variables, which is lethal.

 I had to laugh when I saw the diagram though, after seeing so many straight academic/technical flow charts of this, this was refreshing :D

If anyone really wants to get into it, implement the formulas in octave or matlab then you will see how easy it is. This filter is extremely helpful, “simple” and has countless applications.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=921#respond)↓ 
91.   ![Image 164](https://secure.gravatar.com/avatar/88a94a9fd763c17bf77a5c46ef219c263d02c1870a805ea07be6352def180858?s=44&d=mm&r=g)**ulzha**[July 17, 2016 at 4:09 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-922)
Awesome! Acquisition of techniques like this might end up really useful for my robot builder aspirations… *sigh* *waiting for parts to arrive*

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=922#respond)↓ 
92.   ![Image 165](https://secure.gravatar.com/avatar/0941597392483ed3671b641c6f162a643ad5579bcb85e6164bc6060fe0069b7a?s=44&d=mm&r=g)**satish**[July 18, 2016 at 4:05 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-923)
An excellent way of teaching in a simplest way.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=923#respond)↓ 
93.   ![Image 166](https://secure.gravatar.com/avatar/ef637ad8906452a7b6c6c02602b77d7b3f2e4e3b776ff2a6df973bfdc18164d7?s=44&d=mm&r=g)**Abdulrahman Darwish**[July 26, 2016 at 7:50 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-925)
Thank you so much, that was really helpful . AMAZING

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=925#respond)↓ 
94.   ![Image 167](https://secure.gravatar.com/avatar/a7059d804872f4096b70fd683a2631f8560806beb68c3503b3563d7478923501?s=44&d=mm&r=g)**James Wu**[August 2, 2016 at 4:09 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-928)
Excellent tutorial on kalman filter, I have been trying to teach myself kalman filter for a long time with no success. But I actually understand it now after reading this, thanks a lot!!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=928#respond)↓ 
95.   ![Image 168](https://secure.gravatar.com/avatar/339e2fece63fc2a2fc5d9d5bd9edb6c88d0e9ff292c2756f470e357de032a52e?s=44&d=mm&r=g)**Harry**[August 5, 2016 at 1:08 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-930)
Thank you very much for your explanation. This is the best tutorial that I found online. I’m also expect to see the EKF tutorial. Thank you!!!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=930#respond)↓ 
96.   ![Image 169](https://secure.gravatar.com/avatar/066b42d99b66c530188bf11f8c3bd072cf2a66e127059897cb8ca70c407d938d?s=44&d=mm&r=g)**zjulion**[August 10, 2016 at 9:36 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-931)
Hi, dude,

 great article.

 there is a typo in eq(13) which should be \sigam_1 instead of \sigma_0.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=931#respond)↓ 
    1.   ![Image 170](https://secure.gravatar.com/avatar/04bacec2489854dc64f60162c989d2bc5f48720522d85c2166c90328460746e5?s=44&d=mm&r=g)**tbabb**Post author[August 12, 2016 at 8:28 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-932)
Nope, that would give the wrong answer. See the same math in the citation at the bottom of the article.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=932#respond)↓ 

97.   ![Image 171](https://secure.gravatar.com/avatar/8b63b264896b2c075ab39f8d8b420a05f38c1377968dd584cc9e89741272ea0f?s=44&d=mm&r=g)**Oki Matra**[August 14, 2016 at 6:24 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-936)
Please write your explanation on the EKF topic as soon as possible…, or please tell me the recommended article about EKF that’s already existed by sending the article through the email :) (or the link)

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=936#respond)↓ 
98.   ![Image 172](https://secure.gravatar.com/avatar/372566935776558286722da783e18a4ff47f5a4c46b725f55176144f2d94b3fe?s=44&d=mm&r=g)**anderstood**[August 20, 2016 at 11:27 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-937)
Thank you for this excellent post. Just one detail: the fact that Gaussians are “simply” multiplied is a very subtle point and not as trivial as it is presented, see [http://stats.stackexchange.com/questions/230596/why-do-the-probability-distributions-multiply-here](http://stats.stackexchange.com/questions/230596/why-do-the-probability-distributions-multiply-here).

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=937#respond)↓ 
    1.   ![Image 173](https://secure.gravatar.com/avatar/e90bcc726d7497f37895abc0a90afe2beeb6ad93c800cc8fb76823a780ba65b0?s=44&d=mm&r=g)**Student**[April 8, 2018 at 1:23 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1157)
Great question! It has confused me a long time

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1157#respond)↓ 

99.   ![Image 174](https://secure.gravatar.com/avatar/9330c024129925cd2500e9835e0fae128893624124b0a72deea2c760828ede90?s=44&d=mm&r=g)**Manny Glover**[August 24, 2016 at 3:06 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-938)
Just another big fan of the article. Great job! I definitely understand it better than I did before.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=938#respond)↓ 
    1.   ![Image 175](https://secure.gravatar.com/avatar/32666de2cd5bac79e022545c89042cee717fa95d84f7c0c7c2003584db1e2094?s=44&d=mm&r=g)**Philip**[March 12, 2024 at 10:52 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1276)
Glad you liked it :)

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1276#respond)↓ 

100.   ![Image 176](https://secure.gravatar.com/avatar/db86812ae4475d911882fc6e2108c381e4e3c42652f4e7fe50a7cc9b1f369451?s=44&d=mm&r=g)**Sandra**[August 26, 2016 at 4:04 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-939)
Oh my god. Thank you so much for this. Until now, I was totally and completely confused by Kalman filters. The pictures and examples are SO helpful. THANK YOU!!!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=939#respond)↓ 
101.   ![Image 177](https://secure.gravatar.com/avatar/b21694e1cfb4b055d2d2f4a4d50e37cca2464794456cee765461ade56f3f67eb?s=44&d=mm&r=g)**Hao Yang**[August 30, 2016 at 4:28 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-940)
Thank you so much for this explaination.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=940#respond)↓ 
102.   ![Image 178](https://secure.gravatar.com/avatar/a0d2c3796c0d5b4b55175793cc50d6a277f16deaa902f827ad57eca9c9e4044a?s=44&d=mm&r=g)**Gary K**[August 30, 2016 at 7:00 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-941)
Love it – thank you M. Bzarg! I owe you a significant debt of gratitude…

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=941#respond)↓ 
103.   ![Image 179](https://secure.gravatar.com/avatar/b55449d0f0ceac9c6034ba961f4bbe05b6951e828a3f8d01a2d5e8f3f76ea5fc?s=44&d=mm&r=g)**Miriam**[September 1, 2016 at 3:48 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-942)
Many thanks for this article,

 sometimes the easiest way to explain something is really the harthest!

 You did it!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=942#respond)↓ 
    1.   ![Image 180](https://secure.gravatar.com/avatar/df1d188b65e1918a97cfb32969509dbe9d22c25a45e11de8633d70eafaa33fce?s=44&d=mm&r=g)**Simon Chen**[September 5, 2016 at 1:04 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-943)
Good job，thank you so much！

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=943#respond)↓ 

104.   ![Image 181](https://secure.gravatar.com/avatar/f22cb170b84876d8591c06f1878e800265e578f1d18f83b771158e01df4c83ad?s=44&d=mm&r=g)**Vic Vega**[September 7, 2016 at 11:00 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-944)
This is a great explanation. The one thing that you present as trivial, but I am not sure what the inuition is, is this statement:

“””

 This is where we need another formula. If we multiply every point in a distribution by a matrix A, then what happens to its covariance matrix Σ?

Well, it’s easy. I’ll just give you the identity:

 Cov(x)=Σ

 Cov(Ax)==AΣA^T

 “””

Why is that easy? Thanks so much for your effort!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=944#respond)↓ 
    1.   ![Image 182](https://secure.gravatar.com/avatar/04bacec2489854dc64f60162c989d2bc5f48720522d85c2166c90328460746e5?s=44&d=mm&r=g)**tbabb**Post author[September 10, 2016 at 12:49 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-945)
It’s easy because I gave it to you. :)

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=945#respond)↓ 
    2.   ![Image 183](https://secure.gravatar.com/avatar/23d9c5bb84145699441e3b57c5f1b826768ee5c2958a6466074b47cf8f1f149c?s=44&d=mm&r=g)**Will C**[April 27, 2017 at 4:12 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1036)
I think of it in shorthand – and I could be wrong – as

 — you spread state x out by multiplying by A

 — sigma is the covariance of the vector x (1d), which spreads x out by multiplying x by itself into 2d

 so

 — you spread the covariance of x out by multiplying by A in each dimension ; in the first dimension by A, and in the other dimension by A_t

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1036#respond)↓ 

105.   ![Image 184](https://secure.gravatar.com/avatar/3f750c15cbb0e8023b43d018de2de5d9e3e97f0ac50aa4e41a819625aa375a8f?s=44&d=mm&r=g)**Esteban Zuluaga**[September 10, 2016 at 12:07 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-946)
Thanks for making science and math available to everyone!

On mean reverting linear systems how can I use the Kalman filter to measure the half life of mean reversion?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=946#respond)↓ 
106.   ![Image 185](https://secure.gravatar.com/avatar/ec08e97162006aeebf8d35299dea85c0f0ea8ad94c06d9afae66bf8446581102?s=44&d=mm&r=g)**Alejandro**[September 15, 2016 at 8:46 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-947)
Hey!

Just wanted to give some feedback. I really enjoyed your explanation of Kalman filters. Also, thank you very much for the reference!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=947#respond)↓ 
107.   ![Image 186](https://secure.gravatar.com/avatar/583a44650d937eb1b2aa2d00c7d4a2305c250c15ac65f2121dc870c0d17e4e83?s=44&d=mm&r=g)**Lars Kallryd**[September 16, 2016 at 7:52 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-948)
Thanks for a good tutorial !! What does a accelerometer cost to the Arduino? :D

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=948#respond)↓ 
108.   ![Image 187](https://secure.gravatar.com/avatar/8d81a02a5819f2e9f21e8fa5d9bbad9c9c2bd53de1223e83f0a90f61f88cce0c?s=44&d=mm&r=g)**Steffi**[September 16, 2016 at 9:45 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-949)
I have never come across so beautifully and clearly elaborated explanation for Kalman Filter such as your article!! Thanks a lot for giving a lucid idea about Kalman Filter! Do continue to post many more useful mathematical principles

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=949#respond)↓ 
109.   ![Image 188](https://secure.gravatar.com/avatar/fdb05126a4991f0a74303cdf32cac8f379c3af34112007c2470331297dda1ccc?s=44&d=mm&r=g)**hadi**[September 17, 2016 at 3:44 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-951)
Hey!

Thanks for the great article. I have a couple of questions though:

1) Why do we multiply the state vector (x) by H to make it compatible with the measurements. Why don’t we do it the other way around? Would there be any issues if we did it the other way around?

2) If you only have a position sensor (say a GPS), would it be possible to work with a PV model as the one you have used? I understand that we can calculate the velocity between two successive measurements as (x2 – x1/dt). I just don’t understand where this calculation would be fit in.

Thanks :)

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=951#respond)↓ 
110.   ![Image 189](https://secure.gravatar.com/avatar/48ee341bf02700b18e09ae994ab547827a8506c08bfb6ac2dd93c59b4dc5c169?s=44&d=mm&r=g)**Selina**[October 4, 2016 at 1:26 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-952)
I am currently working on my undergraduate project where I am using a Kalman Filter to use the GPS and IMU data to improve the location and movements of an autonomous vehicle. I would like to know what was in Matrix A that you multiplied out in equations 4 and 5. Thank you for the helpful article!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=952#respond)↓ 
    1.   ![Image 190](https://secure.gravatar.com/avatar/98fe3c3abd5dd0a4d8e201dbaf037fb5c9fc5da068d330d33c0226a94539da99?s=44&d=mm&r=g)**Burak Cetinkaya**[October 16, 2016 at 10:48 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-956)
The matrix A is just an example in equation 4, it is F_k in the equation 5. ( A = F_k )

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=956#respond)↓ 

111.   ![Image 191](https://secure.gravatar.com/avatar/921745d298ae20f6bd531de22f29c7ff81fa93334350c2504dd84ae9a680dd2a?s=44&d=mm&r=g)**Panruo Wu**[October 6, 2016 at 12:15 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-953)
Great article Thank you!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=953#respond)↓ 
112.   ![Image 192](https://secure.gravatar.com/avatar/61d7b07e6b25510b071d8ce130d30dfcc0a6e78dfacf7f31d7eca7eb00d544ef?s=44&d=mm&r=g)**[Nicolas Bouliane](http://en.nicolasbouliane.com/)**[October 15, 2016 at 10:41 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-955)
Thanks for making math accessible to us. I wish more math topics were presented this well.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=955#respond)↓ 
113.   ![Image 193](https://secure.gravatar.com/avatar/989c22ffafb857818cf50aa5a408ccbcc65ff68055fe516c1268c2543af30381?s=44&d=mm&r=g)**Rocco**[October 17, 2016 at 9:16 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-957)
Very cool article! Thank you!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=957#respond)↓ 
114.   ![Image 194](https://secure.gravatar.com/avatar/8eb0d1585195ae71f0b6054f9c6d5e38fbeb2aeefac8781b8ffe730cf2e3e4d8?s=44&d=mm&r=g)**Rodrigo Alves**[October 21, 2016 at 9:31 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-958)
Awesome post. Thanks a lot !

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=958#respond)↓ 
115.   ![Image 195](https://secure.gravatar.com/avatar/80927e3352f2cc2b3b864469d5bd55ce15b98d6a53ba9f2ea709ce1cb4ec7432?s=44&d=mm&r=g)**Hazem Helal**[October 22, 2016 at 1:58 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-959)
Thank you for your amazing work!

 but i have a question please !

 why this ??

 We can knock an Hk off the front of every term in (16) and (17) (note that one is hiding inside K ), and an HTk off the end of all terms in the equation for P′k.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=959#respond)↓ 
116.   ![Image 196](https://secure.gravatar.com/avatar/b1073ce43363eb48ec905176ef0c4d9c0902e8e1ffc7dbab435563d89aa0ce65?s=44&d=mm&r=g)**thomai**[October 23, 2016 at 5:36 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-960)
very nice! thanks!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=960#respond)↓ 
117.   ![Image 197](https://secure.gravatar.com/avatar/e765aa479b80ad53c020d4f1e74c829df04f5d91be8bbb500538f0bc62f80e98?s=44&d=mm&r=g)**Bonobo2000**[November 14, 2016 at 1:12 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-963)
excellent job, thanks a lot for this article.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=963#respond)↓ 
118.   ![Image 198](https://secure.gravatar.com/avatar/baedc23cd1983f1329cb3881bd0ed8dbf8c08342541ab9b82534dc130efd9493?s=44&d=mm&r=g)**Jonathan B**[November 17, 2016 at 6:24 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-964)
I know I am very late to this post, and I am aware that this comment could very well go unseen by any other human eyes, but I also figure that there is no hurt in asking. This article was very helpful to me in my research of kalman filters and understanding how they work. I would absolutely love if you were to do a similar article about the Extended Kalman filter and the Unscented Kalman Filter (or Sigma Point filter, as it is sometimes called). If you never see this, or never write a follow up, I still leave my thank you here, for this is quite a fantastic article.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=964#respond)↓ 
119.   ![Image 199](https://secure.gravatar.com/avatar/cfe6d099903c1dda49b59c26bb294497daa3acca7aeab6aaecb9c4efd6f2bf6b?s=44&d=mm&r=g)**Sheetal Bisht**[November 17, 2016 at 8:36 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-965)
I cannot express how thankful am I to you. I have an interview and i was having trouble in understanding the Kalman Filter due to the mathematical equations given everywhere but how beautifully have you explained Sir!! I understood each and every part and now feeling so confident about the Interview. Thanks to you

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=965#respond)↓ 
120.   ![Image 200](https://secure.gravatar.com/avatar/343e8fa1f471537fb426066862f1d6ca81488697ad754c0b02f18b556bef941a?s=44&d=mm&r=g)**Shilpi M**[November 19, 2016 at 3:14 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-966)
Thank you very much..This article is really amazing

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=966#respond)↓ 
121.   ![Image 201](https://secure.gravatar.com/avatar/204bcf65260b052041008110c276c0e44a65a34ce14d100149abe04d4f536c37?s=44&d=mm&r=g)**Biao Yang**[November 21, 2016 at 3:56 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-967)
I have been working on Kalman Filter , Particle Filter and Ensemble Kalman Filter for my whole PhD thesis, and this article is absolutely the best tutorial for KF I’ve ever seen. I’m looking forward to read your article on EnKF.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=967#respond)↓ 
    1.   ![Image 202](https://secure.gravatar.com/avatar/204bcf65260b052041008110c276c0e44a65a34ce14d100149abe04d4f536c37?s=44&d=mm&r=g)**Biao Yang**[November 21, 2016 at 4:13 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-968)
One thing may cause confusion this the normal * normal part. The product of two independent normals are not normal. It should be better to explained as: p(x | z) = p(z | x) * p(x) / p(z) = N(z| x) * N(x) / normalizing constant.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=968#respond)↓ 
        1.   ![Image 203](https://secure.gravatar.com/avatar/69db3a8b673d08f91d58bf9582cec32a99b4ee51089c927c34a22da0c0a31aa9?s=44&d=mm&r=g)**empiricist**[February 17, 2017 at 3:24 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1004)
Awesome. I felt something was at odds there too. anderstood in the previous reply also shared the same confusion. I was about to reconcile it on my own, but you explained it right! Thanks!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1004#respond)↓ 

122.   ![Image 204](https://secure.gravatar.com/avatar/a096b432e8599c1854db123d8bee74aa893205990d16dcf257e0e66186a248f9?s=44&d=mm&r=g)**Yagmur**[November 22, 2016 at 7:48 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-969)
Thanks a lot for the nice and detailed explanation!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=969#respond)↓ 
123.   ![Image 205](https://secure.gravatar.com/avatar/19e9fb775ee4a208e0b4c27b262dfcdf4240f1435077fef7b49934f3c73058a2?s=44&d=mm&r=g)**Livio**[November 25, 2016 at 5:22 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-970)
After years of struggling to catch the physical meaning of all those matrices, evereything is crystal clear finally!

THANK YOU MAN, I LOVE YOU

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=970#respond)↓ 
124.   ![Image 206](https://secure.gravatar.com/avatar/75f0da1eb8e33b3db4d05de720d1e0502276a92bc09ac307a74d01e4e9c13d9e?s=44&d=mm&r=g)**johnny**[December 2, 2016 at 7:46 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-971)
Nice article!

 it seems a C++ implementation of a Kalman filter is made here :

[https://github.com/hmartiro/kalman-cpp](https://github.com/hmartiro/kalman-cpp)

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=971#respond)↓ 
125.   ![Image 207](https://secure.gravatar.com/avatar/677b7f6c3738c33e42a475f4e566a2be6cbb6b826a5fe9afd23249595054d5a1?s=44&d=mm&r=g)**Maissam**[December 4, 2016 at 7:33 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-973)
what amazing description………thank you very very very much

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=973#respond)↓ 
126.   ![Image 208](https://secure.gravatar.com/avatar/118172e5f062048ea907bf22cc9d2cd49989ebeb18a16531930bd34faeb439d7?s=44&d=mm&r=g)**Edu**[December 9, 2016 at 1:15 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-975)
Very good and clear explanation ! Many kudos !

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=975#respond)↓ 
127.   ![Image 209](https://secure.gravatar.com/avatar/e87c5b917c53c260bc8cdc6092e8ea527be8a1129d0080b89c3922215be5b09f?s=44&d=mm&r=g)**Donovan Baarda**[December 11, 2016 at 11:53 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-976)
For me the revelation on what kalman is came when I went through the maths for a single dimensional state (a 1×1 state matrix, which strips away all the matrix maths). When you do that it’s pretty clear it’s just the weighed average between the model and the sensor(s), weighted by their error variance.

It also explains how kalman filters can have less lag. You can’t have a filter without lag unless you can predict the future, since filters work by taking into account multiple past inputs. However, with kalman the model is a a kind of “future” prediction (provided your model is good enough).

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=976#respond)↓ 
128.   ![Image 210](https://secure.gravatar.com/avatar/97cc9a592cae3962215b8678cfb7b86912e46f081cc69d9d0f3cfb9098e6368c?s=44&d=mm&r=g)**Math Fan**[December 22, 2016 at 3:47 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-978)
Thank you for this article. It is very nice and helpful. One of the best teaching tips I picked up from this is coloring equations to match the colored description. Brilliant!

When you knock off the Hk matrix, that makes sense when Hk has an inverse. Is the result the same when Hk has no inverse? In this case, how does the derivation change?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=978#respond)↓ 
129.   ![Image 211](https://secure.gravatar.com/avatar/697746633422bae9064ba32425b5ec10f3ba2b6cbaa6c76cea765c5eb0bfc4d9?s=44&d=mm&r=g)**John**[December 22, 2016 at 7:28 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-979)
Excellent ! You explained it clearly and simple. Thanks a lot!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=979#respond)↓ 
130.   ![Image 212](https://secure.gravatar.com/avatar/4dda71499a76b981bf635b95974fb4a003aacd94a274445b54c62b5659c6ea41?s=44&d=mm&r=g)**Ramesh**[December 23, 2016 at 10:44 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-980)
Awesome work !! . can you explain particle filter also?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=980#respond)↓ 
131.   ![Image 213](https://secure.gravatar.com/avatar/27ab91caa72fa6007597150c41de0ea715ecb84843b1275627356d0a2c5a993a?s=44&d=mm&r=g)**Neil**[December 26, 2016 at 7:30 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-981)
You explained it clearly and simplely. I had not seen it. Tks very much!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=981#respond)↓ 
132.   ![Image 214](https://secure.gravatar.com/avatar/f15ca497d0164bb8fef1ed5d854dc523a117e8915c39d3c5ac083f4a7c80d5da?s=44&d=mm&r=g)**airyym**[January 7, 2017 at 12:15 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-984)
It’s great post. But I have one question.

 In equation (16), Where did the left part come from? Updated state is already multiplied by measurement matrix and knocked off? I couldn’t understand this step.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=984#respond)↓ 
133.   ![Image 215](https://secure.gravatar.com/avatar/54d2b04801ac735543b3488f574f593e68b553f1d85178bb1ce525a69a0cbce1?s=44&d=mm&r=g)**Mansoor Ghazi**[January 11, 2017 at 4:58 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-986)
Thanks a lot! This is probably the best explanation of KF anywhere in the literature/internet.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=986#respond)↓ 
134.   ![Image 216](https://secure.gravatar.com/avatar/136583459f7c7624e5417f8ca4a616d52b756b38608c606676f606b70521c712?s=44&d=mm&r=g)**Richard Manning**[January 12, 2017 at 4:24 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-987)
Really fantastic explanation of something that baffles a lot of people (me included). Well done!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=987#respond)↓ 
135.   ![Image 217](https://secure.gravatar.com/avatar/e9c1b633f533e402cbec6abd78125eecfb3c5b30a22e476559ed183aa4296e9b?s=44&d=mm&r=g)**H.D.N.**[January 13, 2017 at 12:32 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-988)
So damn good! This is the first time that I finally understand what Kalman filter is doing.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=988#respond)↓ 
136.   ![Image 218](https://secure.gravatar.com/avatar/d379a13f913d4249078174a53d25a0aea83c4424f4dc9055d5177852de2a779b?s=44&d=mm&r=g)**[miguel arrunategui](http://www.uni.edu.pe/)**[January 14, 2017 at 5:37 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-989)
I am a University software engineering professor, and this explanation is one of the best I have seen, thanks for your outstanding work.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=989#respond)↓ 
137.   ![Image 219](https://secure.gravatar.com/avatar/12323c22307fd12ff631b38d8ec3917544db8389d3626598ff9413f7b373b78d?s=44&d=mm&r=g)**xchip**[January 21, 2017 at 10:43 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-991)
Where have you been all my life!!!! Finally got it!!!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=991#respond)↓ 
138.   ![Image 220](https://secure.gravatar.com/avatar/f73705763993daa6683b6b7d9579ddc5d5ebc3ed8bde953bf47395c636342946?s=44&d=mm&r=g)**W**[January 21, 2017 at 1:49 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-992)
This is al kinds of awesome.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=992#respond)↓ 
139.   ![Image 221](https://secure.gravatar.com/avatar/60471d3b77871e97f907771e341e3a7ce63f8088eac41260224aa97899305464?s=44&d=mm&r=g)**David**[January 22, 2017 at 9:16 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-993)
Great write-up! Thanks!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=993#respond)↓ 
140.   ![Image 222](https://secure.gravatar.com/avatar/6202eecc6d631b7c36fada792108bf1b27c0592cabcbab62b7f3e430a3d6f9d1?s=44&d=mm&r=g)**Vlad**[January 24, 2017 at 3:14 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-994)
Loving the explanation.

 A great refresher…

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=994#respond)↓ 
141.   ![Image 223](https://secure.gravatar.com/avatar/60f756ae9f6d63b4fe742298d2d5502495f2eae067d69cff37b55a2472bc4d79?s=44&d=mm&r=g)**Divya**[January 26, 2017 at 3:24 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-995)
This is an amazing explanation; took me an hour to understand what I had been trying to figure out for a week.

 One question:

 what exactly does H do? Can you give me an example of H? I was assuming that the observation x IS the mean of where the real x could be, and it would have a certain variance. But instead, the mean is Hx. Why is that? why is the mean not just x?

 Thanks!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=995#respond)↓ 
142.   ![Image 224](https://secure.gravatar.com/avatar/09d38d6df3d958ac160330df7d7170166412e761ea507ce1f56020da16a4e980?s=44&d=mm&r=g)**trecon**[February 5, 2017 at 8:23 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-996)
Thanks for the KF article. Very interesting!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=996#respond)↓ 
143.   ![Image 225](https://secure.gravatar.com/avatar/226de27dd356d75331789f548630c342dfadd43e49f4de3e66a591c626e89e40?s=44&d=mm&r=g)**juanattack**[February 5, 2017 at 6:04 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-997)
Impressive and clear explanation of such a tough subject! Really loved the graphical way you used, which appeals to many of us in a much more significant way. Bravo!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=997#respond)↓ 
144.   ![Image 226](https://secure.gravatar.com/avatar/8b417703391ef3830f7a31e8410690580d9bd6b8942645bd87028764d7dabc2a?s=44&d=mm&r=g)**Yao**[February 6, 2017 at 11:15 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-998)
Great work! Thank you so much!

But I have a simple problem. In pratice, we never know the ground truth, so we should assign an initial value for Pk. And my problem is Pk and kalman gain k are only determined by A,B,H,Q,R, these parameters are constant. Therefore, as long as we are using the same sensor(the same R), and we are measuring the same process(A,B,H,Q are the same), then everybody could use the same Pk, and k before collecting the data. Am I right?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=998#respond)↓ 
145.   ![Image 227](https://secure.gravatar.com/avatar/a3b07dcbbeb8b8bf6034ce428432fdf4fd83421c2c1a62d9de002f54128ea232?s=44&d=mm&r=g)**Raul**[February 10, 2017 at 10:59 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-999)
Veeeery nice article! One of the best, if not the best, I’ve found about kalman filtering! Makes it much easier to understand! Thanks a lot for your great work!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=999#respond)↓ 
146.   ![Image 228](https://secure.gravatar.com/avatar/b6e820301b644d77f11c0e9c8fa382abd7adb34c06666ae9a66804497820761d?s=44&d=mm&r=g)**Selin**[February 11, 2017 at 5:13 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1000)
Thank you for this clear explanation!!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1000#respond)↓ 
147.   ![Image 229](https://secure.gravatar.com/avatar/88a0e708a8f801a0008437a90f3bf28e44fbde883453216ae46d41b5d44ab80f?s=44&d=mm&r=g)**feng liu**[February 15, 2017 at 9:45 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1001)
This is an amazing introduction! I read it through and want to and need to read it against. But cannot suppress the inner urge to thumb up!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1001#respond)↓ 
148.   ![Image 230](https://secure.gravatar.com/avatar/c5212f6294d7a5b958fd7d3486fee4cf974e85f9b20d448ea408f8cc2b183580?s=44&d=mm&r=g)**Revathi**[February 16, 2017 at 11:43 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1002)
Hello!

 I have acceleration measurements only.How do I estimate position and velocity?

 What will be my measurement matrix?

 Is it possible to construct such a filter?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1002#respond)↓ 
149.   ![Image 231](https://secure.gravatar.com/avatar/62b282124488d8ba4c9dca13f7c424503d57ce4158930835c7af5b54de766fb4?s=44&d=mm&r=g)**Yunfei**[February 16, 2017 at 12:19 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1003)
Your tutorial of KF is truely amazing. Every material related to KF now lead and redirect to this article (orginal popular one was Kalman Filter for dummies). Hope to see your EKF tutorial soon. Thank you.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1003#respond)↓ 
150.   ![Image 232](https://secure.gravatar.com/avatar/14ca6fbcb2e81bd88db389ce51713459de7cb092c0c176e62fcfae789bee17de?s=44&d=mm&r=g)**Jones**[February 17, 2017 at 5:00 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1005)
Amazing post! Thank you! I guess you did not write the EKF tutorial, eventually?

Small question, if I may:

 What if the sensors don’t update at the same rate? You want to update your state at the speed of the fastest sensor, right? Do you “simply” reduce the rank of the H matrix for the sensors that haven’t been updated since the last prediction?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1005#respond)↓ 
151.   ![Image 233](https://secure.gravatar.com/avatar/bf0d9dbbe368b66a0b2cc5490cf32f3d2909d76b3c88b4736a0cfc07b6306e8e?s=44&d=mm&r=g)**florian**[February 23, 2017 at 6:57 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1006)
Hey, nice article. I enjoyed reading it. One small correction though: the figure which shows multiplication of two Gaussians should have the posterior be more “peaky” i.e. less variance than both the likelihood and the prior. The blue curve should be more certain than the other two.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1006#respond)↓ 
152.   ![Image 234](https://secure.gravatar.com/avatar/3f381b432022d9acaa52d611370ba181d5f61b06945f1a15e72bf7c46df13dfe?s=44&d=mm&r=g)**Müller**[February 24, 2017 at 10:14 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1007)
Very well explained!! Thank you.

 Could you pleaseeeee extend this to the Extended, Unscented and Square Root Kalman Filters as well.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1007#respond)↓ 
153.   ![Image 235](https://secure.gravatar.com/avatar/36abe8424fb0ec3f9a6f4943a0ae9dba4f2f1da69a4821509d1445513f68aee8?s=44&d=mm&r=g)**Alberto Bussini**[February 26, 2017 at 12:07 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1008)
I’m currently studying mechatronics and robotics in my university and we just faced the Kalman Filter. It was really difficult for me to give a practical meaning to it, but after I read your article, now everything is clear!

 Really a great one, I loved it!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1008#respond)↓ 
154.   ![Image 236](https://secure.gravatar.com/avatar/2cb18c31f1117456b890316c0eed43b59ad28317b2122f147caf95a070ae3822?s=44&d=mm&r=g)**[xibo zhang](https://www.facebook.com/profile.php?id=100010574532158)**[February 28, 2017 at 6:22 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1011)
perfect work, simple and elegant!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1011#respond)↓ 
155.   ![Image 237](https://secure.gravatar.com/avatar/6e5ea16ab26e892df921f506790838cd9088fdfe3cee4f62229caf8e235e4c23?s=44&d=mm&r=g)**Bharti Kaushal**[March 3, 2017 at 6:09 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1013)
Thanks Tim, nice explanation on KF ..really very helpful..looking forward for EKF & UKF

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1013#respond)↓ 
156.   ![Image 238](https://secure.gravatar.com/avatar/c82043131a0b6f2e57fee4715ec838c7e9e5d7849f9ac9cad89c3e95c5707128?s=44&d=mm&r=g)**eric**[March 3, 2017 at 12:00 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1014)
Best Guide on KF ever !

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1014#respond)↓ 
157.   ![Image 239](https://secure.gravatar.com/avatar/266b5fcbdd60e7ab48989751876875496974ba9964d0c2c9a4341e42991563d7?s=44&d=mm&r=g)**Omer korech**[March 3, 2017 at 12:45 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1015)
That was fascinating

 Thanks

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1015#respond)↓ 
158.   ![Image 240](https://secure.gravatar.com/avatar/2f134f2e25224e677aac24e50928211df8b2399906a97bf6c18c817d23b80c81?s=44&d=mm&r=g)**d**[March 7, 2017 at 10:32 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1016)
For the extended Kalman Filter:

 ‘The Extended Kalman Filter: An Interactive Tutorial for Non-Experts’

[https://home.wlu.edu/~levys/kalman_tutorial/](https://home.wlu.edu/~levys/kalman_tutorial/)

 (written to be understood by high-schoolers)

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1016#respond)↓ 
159.   ![Image 241](https://secure.gravatar.com/avatar/345137c33557a5dba108a3ca9f515a696537755648dfb45ff150fa7932e37075?s=44&d=mm&r=g)**Niel**[March 13, 2017 at 9:21 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1018)
I had read an article about simultaneously using 2 same sensors in kalman filter, do you think it will work well if I just wanna measure only the direction using E-compass?? What are those inputs then and the matrix H?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1018#respond)↓ 
160.   ![Image 242](https://secure.gravatar.com/avatar/1f6c8d76d619f831ec29733b344fc7be77966ef2133c2532eaedfd0f21655699?s=44&d=mm&r=g)**nhorro**[March 26, 2017 at 2:22 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1019)
Thanks, great article!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1019#respond)↓ 
161.   ![Image 243](https://secure.gravatar.com/avatar/6fab961e77e4487453ecf978198aa1df5d694d7a30af0ab24dabda66fe36c261?s=44&d=mm&r=g)**Budwar**[March 26, 2017 at 7:52 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1020)
This is great. Such a wonderful description. Can you point me towards somewhere that shows the steps behind finding the expected value and SD of P(x)P(y), with normalisation. I’m getting stuck somewhere

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1020#respond)↓ 
    1.   ![Image 244](https://secure.gravatar.com/avatar/04bacec2489854dc64f60162c989d2bc5f48720522d85c2166c90328460746e5?s=44&d=mm&r=g)**tbabb**Post author[March 26, 2017 at 7:58 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1021)
I don’t have a link on hand, but as mentioned above some have gotten confused by the distinction of taking pdf(X*Y) and pdf(X) * pdf(Y), with X and Y two independent random variables. It is the latter in this context, as we are asking for the probability that X=x and Y=y, not the probability of some third random variable taking on the value x*y.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1021#respond)↓ 

162.   ![Image 245](https://secure.gravatar.com/avatar/f3f64a07d432344cef4111fed28b6904b7f363f747a1788577e1bfe2576a59d2?s=44&d=mm&r=g)**Faruk Mustafic**[March 31, 2017 at 4:04 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1022)
Really clear article. Wish there were more explanations like this one.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1022#respond)↓ 
163.   ![Image 246](https://secure.gravatar.com/avatar/9ed87250cc46bc974b0ba19bac204d11c03170f586cffe57b16f11ab8edd55d2?s=44&d=mm&r=g)**georgerififi**[April 3, 2017 at 2:48 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1024)
great job! best explanation so far

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1024#respond)↓ 
164.   ![Image 247](https://secure.gravatar.com/avatar/b568a45700e9902ef5ffe8772f62b255057772b6b2c2312094426d27123763c5?s=44&d=mm&r=g)**Mandrake**[April 3, 2017 at 10:28 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1025)
Absolutely brilliant exposition!!! Thank you for the fantastic job of presenting the KF in such a simple and intuitive way.

I could be totally wrong, but for the figure under the section ‘Combining Gaussians’, shouldn’t the blue curve be taller than the other two curves? The location of the resulting ‘mean’ will be between the earlier two ‘means’ but the variance would be lesser than the earlier two variances causing the curve to get leaner and taller.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1025#respond)↓ 
    1.   ![Image 248](https://secure.gravatar.com/avatar/04bacec2489854dc64f60162c989d2bc5f48720522d85c2166c90328460746e5?s=44&d=mm&r=g)**tbabb**Post author[April 3, 2017 at 10:42 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1026)
Yes, the variance is smaller. The blue curve is drawn unnormalized to show that it is the intersection of two statistical sets. I’ve added a note to clarify that, as I’ve had a few questions about it. Thanks for your comment!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1026#respond)↓ 
        1.   ![Image 249](https://secure.gravatar.com/avatar/b568a45700e9902ef5ffe8772f62b255057772b6b2c2312094426d27123763c5?s=44&d=mm&r=g)**Mandrake**[April 3, 2017 at 10:47 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1027)
That totally makes sense. Thanks for clarifying that bit.

 And did I mention you are brilliant!!!? :-)

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1027#respond)↓ 

165.   ![Image 250](https://secure.gravatar.com/avatar/0539f1b410c69fcea8e480f817ea89606e19cdc1a0e9b7cd17ff6e4e56e93265?s=44&d=mm&r=g)**Anirudh**[April 6, 2017 at 10:41 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1028)
Great article, I read several other articles on Kalman filter but could not understand it clearly.

However, one question still remains unanswered is how to estimate covariance matrix. It would be great if you could share some simple practical methods for estimation of covariance matrix.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1028#respond)↓ 
166.   ![Image 251](https://secure.gravatar.com/avatar/f6b5df09cab52acda1bb0adbcd11c0b5ffbeb0d9be27420e7e0bc9c136dc27b0?s=44&d=mm&r=g)**Haseena**[April 9, 2017 at 12:25 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1029)
Very Nice Explanation..

 Thanks for your effort

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1029#respond)↓ 
167.   ![Image 252](https://secure.gravatar.com/avatar/f8d9a85ef5a36dd72daf2ff5b60b4815b81a18b610508ff98f22b0e5bda72c57?s=44&d=mm&r=g)**abdulrahim ghzal**[April 14, 2017 at 2:43 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1030)
thank you … it is a very helpful article

 hope the best for you ^_^

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1030#respond)↓ 
168.   ![Image 253](https://secure.gravatar.com/avatar/89df5189b42654a4891a267c38c8946fa4d8b4b689800896ee0bb43104514a74?s=44&d=mm&r=g)**Luca**[April 19, 2017 at 4:50 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1031)
Very nice explanation and overall good job ! Thanks !

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1031#respond)↓ 
169.   ![Image 254](https://secure.gravatar.com/avatar/313bb60145beca078637d30765a6bee37cd1d07a0da6859c84e642484e1aa09d?s=44&d=mm&r=g)**Sai Krishna Allani**[April 21, 2017 at 6:54 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1032)
Nice explanation. I understood everything expect I didn’t get why you introduced matrix ‘H’. Can you please explain it?

Thanks,

 Krishna

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1032#respond)↓ 
    1.   ![Image 255](https://secure.gravatar.com/avatar/6f8a9049f29687ff3e8a734dcfbaef6fd1dabe41d5a06f96e33e48c69dc9af4e?s=44&d=mm&r=g)**Bharath Ballamudi**[April 27, 2017 at 1:34 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1035)
Perhaps, the sensor reading dimensions (possibly both scale and units) are not consistent with what you are keeping track of and predict……….as the author had previously alluded to that these sensor readings are might only ‘indirectly’ measure these variables of interest. Say, the sensors are measuring acceleration and then you are leveraging these acceleration measurements to compute the velocity (you are keeping track of) ; and same holds true with the other sensor. Since, there is a possibility of non-linear relationship between the corresponding parameters it warrants a different co-variance matrix and the result is you see a totally different distribution with both mean and co-variance different from the original distribution. So, essentially, you are transforming one distribution to another consistent with your setting.

Hope this makes sense.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1035#respond)↓ 
    2.   ![Image 256](https://secure.gravatar.com/avatar/04bacec2489854dc64f60162c989d2bc5f48720522d85c2166c90328460746e5?s=44&d=mm&r=g)**tbabb**Post author[April 27, 2017 at 7:07 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1037)
H puts sensor readings and the state vector into the same coordinate system, so that they can be sensibly compared.

In the simplest case, H can be biases and gains that map the units of the state vector to the units of the sensors. In a more complex case, some element of the state vector might affect multiple sensor readings, or some sensor reading might be influenced by multiple state vector elements. For example, a craft’s body axes will likely not be aligned with inertial coordinates, so each coordinate of a craft’s interial-space acceleration vector could affect all three axes of a body-aligned accelerometer.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1037#respond)↓ 

170.   ![Image 257](https://secure.gravatar.com/avatar/ea08043f2b39e324f372785701ff9c778bc9602a1699198899af095f683fb97b?s=44&d=mm&r=g)**imane**[April 23, 2017 at 6:29 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1033)
Bonjour,

 i need to implémet a banc of 4 observers (kalman filter) with DOS( Dedicated observer), in order to detect and isolate sensors faults

 each observer is designed to estimate the 4 system outputs qu’une seule sortie par laquelle il est piloté, les 3 autres sorties restantes ne sont pas bien estimées, alors que par définition de la structure DOS, chaque observateur piloté par une seule sortie et toutes les entrées du système doit estimer les 4 sorties.

 SVP veuillez m’indiquer comment faire pour résoudre ce problème et merci d’avance

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1033#respond)↓ 
171.   ![Image 258](https://secure.gravatar.com/avatar/d306acbe37fe1f0c2fc15dad8bbe6d418c596ffe103989f4ace641a64cb85dea?s=44&d=mm&r=g)**Alexei Guriev**[April 24, 2017 at 10:03 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1034)
How I can get Q and R? Can somebody show me exemple.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1034#respond)↓ 
    1.   ![Image 259](https://secure.gravatar.com/avatar/9d8fd9ee6f2549ffcfe6a92ad9e95cff2f320215fbf5f86b1638b332d7604d11?s=44&d=mm&r=g)**Nathaniel Groendyk**[February 9, 2018 at 1:13 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1138)
I can’t figure this out either. Are Q and R vectors? Matrices? Great article! I can almost implement one, but I just cant figure out R & Q.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1138#respond)↓ 
        1.   ![Image 260](https://secure.gravatar.com/avatar/04bacec2489854dc64f60162c989d2bc5f48720522d85c2166c90328460746e5?s=44&d=mm&r=g)**tbabb**Post author[February 9, 2018 at 1:58 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1141)
Q and R are covariances of noise, so they are matrices. Their values will depend on the process and uncertainty that you are modeling.

In many cases the best you can do is measure them, by performing a repeatable process many times, and recording a population of states and sensor readings. You can then compute the covariance of those datasets using the standard algorithm.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1141#respond)↓ 

172.   ![Image 261](https://secure.gravatar.com/avatar/cd1cc77b16ef0bce422a77d9e289c910e3681491d24f29ec6c579c8171d35a3a?s=44&d=mm&r=g)**[jay](http://peepo.com/)**[April 27, 2017 at 4:40 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1038)
I’d like a cookbook demonstration.

ie say: simple sensor with arduino and reduced testcase or absolute minimal C code

tx ~:”

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1038#respond)↓ 
173.   ![Image 262](https://secure.gravatar.com/avatar/776bd073a14ff6e25c372e3ced466d0ff47e3606a4a740ab378af3ca5d0478bc?s=44&d=mm&r=g)**dunanshan**[April 28, 2017 at 5:37 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1039)
Excellent article on Kalman Filter.

 Thank you very much.

But I still have a question, why use multiply to combine Gaussians?

 Maybe it is too simple to verify.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1039#respond)↓ 
174.   ![Image 263](https://secure.gravatar.com/avatar/0b5dd08f303d346dbafbb2be717a1f2643cc6ea3be3836106d8ebc3bb8c8ff2b?s=44&d=mm&r=g)**Yw**[May 4, 2017 at 10:17 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1040)
Really COOL. I understand Kalman Filter now. Thanks very much！

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1040#respond)↓ 
175.   ![Image 264](https://secure.gravatar.com/avatar/474370c11e6477e701bafd23fac03851c54f6f77bfbda7d10271c3ef9dba7e6f?s=44&d=mm&r=g)**Mihir D**[May 5, 2017 at 11:20 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1041)
Amazing article! Explained very well in simple words!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1041#respond)↓ 
176.   ![Image 265](https://secure.gravatar.com/avatar/754a5f29966ac89ed97ffb1b4dd23526a69c9702c790876ad914c0d7a859a25f?s=44&d=mm&r=g)**Tom Riis**[May 6, 2017 at 4:26 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1042)
Thanks so much!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1042#respond)↓ 
177.   ![Image 266](https://secure.gravatar.com/avatar/f0ad6212847ef7007fc880434a510642d032b43fd0d9b5cc98089432c2716845?s=44&d=mm&r=g)**Oguzhan**[May 17, 2017 at 11:55 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1044)
I wanted to clarify something about equations 3 and 4. You give the following equation to find the next state;

Xk=FkXk-1 (equation 3)

You then use the co-variance identity to get equation 4.

Cov(AX) = AEA^t

For Cov(X)= E, are you saying that Cov(X-1) = Pk-1?

Is this the reason why you get Pk=Fk*Pk-1*Fk^T? because Fk*Xk-1 is just Xk therefore you get Pk rather than Pk-1? in equation 5 as F is the prediction matrix?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1044#respond)↓ 
    1.   ![Image 267](https://secure.gravatar.com/avatar/04bacec2489854dc64f60162c989d2bc5f48720522d85c2166c90328460746e5?s=44&d=mm&r=g)**tbabb**Post author[May 17, 2017 at 6:29 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1045)
F is the prediction matrix, and P_{k-1} is the covariance of x_{k-1}.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1045#respond)↓ 

178.   ![Image 268](https://secure.gravatar.com/avatar/1ae2ec7683f75954a19d291d85494225ac652678db7815db372205ec2d380bb8?s=44&d=mm&r=g)**Rafa**[May 18, 2017 at 10:01 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1046)
I have not finish to read the whole post yet, but I couldn’t resist saying I’m enjoying by first time reading an explanation about the Kalman filter. I felt I need to express you my most sincere congratulations. I’ll add more comments about the post when I finish reading this interesting piece of art.

Pd. I’m sorry for my pretty horrible English :(

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1046#respond)↓ 
    1.   ![Image 269](https://secure.gravatar.com/avatar/1ae2ec7683f75954a19d291d85494225ac652678db7815db372205ec2d380bb8?s=44&d=mm&r=g)**Rafa**[May 19, 2017 at 2:02 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1047)
Ok. I have read the full article and, finally, I have understood this filter perfectly and I have applied it to my researches successfully. Thank you so much Tim!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1047#respond)↓ 

179.   ![Image 270](https://secure.gravatar.com/avatar/717a2369dbac53bb3c65ae30bc4e89a5ffb7eaa6fd8f0fc3293bfecb6e716992?s=44&d=mm&r=g)**Craig**[May 20, 2017 at 6:54 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1048)
Super excellent demultiplexing of the Kalman Filter through color coding and diagrams!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1048#respond)↓ 
180.   ![Image 271](https://secure.gravatar.com/avatar/ec3a61195f4a8d8833ffe4d3a60e70c1640b4416e605fdde53ef1fe77a2b09bc?s=44&d=mm&r=g)**Eyal**[May 22, 2017 at 7:55 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1049)
Thank you very much for this lovely explanation.

 Can you please explain:

 1. How do we initialize the estimator ?

 2. How does the assumption of noise correlation affects the equations ?

 3. How can we see this system is linear (a simple explanation with an example like you did above would be great!) ?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1049#respond)↓ 
181.   ![Image 272](https://secure.gravatar.com/avatar/6db86b589d47c233d96956a7a732d488fbfeeb0cc01b1b84d721b6aa59d02e53?s=44&d=mm&r=g)**Brenton**[May 25, 2017 at 12:27 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1050)
Fantastic article, really enjoyed the way you went through the process.

One question, will the Kalman filter get more accurate as more variables are input into it? ie. if you have 1 unknown variable and 3 known variables can you use the filter with all 3 known variables to give a better prediction of the unknown variable and can you keep increasing the known inputs as long as you have accurate measurements of the data.

Mostly thinking of applying this to IMUs, where I know they already use magnetometer readings in the Kalman filter to remove error/drift, but could you also use temperature/gyroscope/other readings as well? Or do IMUs already do the this?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1050#respond)↓ 
182.   ![Image 273](https://secure.gravatar.com/avatar/3bd8915ea82a3065ea216e9c081f0615c55e96b854af1569044ab5950020834d?s=44&d=mm&r=g)**Zaid**[June 14, 2017 at 6:57 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1051)
You are awesome

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1051#respond)↓ 
183.   ![Image 274](https://secure.gravatar.com/avatar/2c6dfdcc3945d0de9bdd19f9ce6bd10096a7b20847f14356132721ef35ed229e?s=44&d=mm&r=g)**Richard C**[June 20, 2017 at 9:05 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1053)
Thanks for this article, it was very useful. Here’s an observation / question:

The prediction matrix F is obviously dependent on the time step (delta t). It also appears the external noise Q should depend on the time step in some way. e.g. if Q is constant, but you take more steps by reducing delta t, the P matrix accumulates noise more quickly. It appears Q should be made smaller to compensate for the smaller time step.

Do you know of a way to make Q something like the amount of noise per second, rather than per step?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1053#respond)↓ 
184.   ![Image 275](https://secure.gravatar.com/avatar/2dcf6736d05387e66fbb03d3453090a022a5c9054fa6a0c0ec8b278baabf9b35?s=44&d=mm&r=g)**ajebulon**[June 21, 2017 at 4:21 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1055)
Very well explained. I found many links about Kalman which contains terrifying equations and I ended up closing every one of them. This article really explains well the basic of Kalman filter.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1055#respond)↓ 
185.   ![Image 276](https://secure.gravatar.com/avatar/6ae43f5fc2c2f474953bda9e968db97f1bbf50f91c93fba0f194a532a3a62a98?s=44&d=mm&r=g)**Lycos**[June 24, 2017 at 1:19 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1056)
Great article!! Even though I already used Kalman filter, I just used it. By this article, I can finally get knowledges of Kalman filter.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1056#respond)↓ 
186.   ![Image 277](https://secure.gravatar.com/avatar/35071335537e89ed5aaf3ade4a565f7eb757d21c4506b2eaa620bddb181293c0?s=44&d=mm&r=g)**Romain**[June 28, 2017 at 7:10 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1060)
Hi, Great article and great images !

you should mention how to initialize the covariance matrices.

I implemented my own and I initialized Pk as P0=[1 0; 0 1]. Pk will then converge by itself.

I initialized Qk as Q0=[0 0; 0 varA], where varA is the variance of the accelerometer. varA is estimated form the accelerometer measurement of the noise at rest.

Same for Rk, I set it as Rk=varSensor. The estimated variance of the sensor at rest.

ps. to get the variance of few measure points at rest, let’s call them xi={x1, x2, … xn}

 first get the mean as: mean(x)=sum(xi)/n

 then the variance is given as: var(x)=sum((xi-mean(x))^2)/n

 see here (scroll down for discrete equally likely values): [https://en.wikipedia.org/wiki/Variance](https://en.wikipedia.org/wiki/Variance)

Cheers,

 Romain

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1060#respond)↓ 
    1.   ![Image 278](https://secure.gravatar.com/avatar/9d8fd9ee6f2549ffcfe6a92ad9e95cff2f320215fbf5f86b1638b332d7604d11?s=44&d=mm&r=g)**Nathaniel Groendyk**[February 9, 2018 at 1:16 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1139)
THANK YOU KIND SIR! :)

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1139#respond)↓ 

187.   ![Image 279](https://secure.gravatar.com/avatar/0ccdad30ebc875d4a45b3ed1ab0c607f05974e8abc4dc8c50cc4d4eadaae2632?s=44&d=mm&r=g)**Aditya**[July 5, 2017 at 8:15 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1062)
This is definitely one of the best explanations of KF I have seen! I am trying to explain KF/EKF in my master thesis and I was wondering if I could use some of the images! They’re really awesome!

Cheers,

 Aditya

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1062#respond)↓ 
188.   ![Image 280](https://secure.gravatar.com/avatar/080c8e5d5e869140968f9969f4ff6916c7b3c5219fda067c490e68b411bea7b4?s=44&d=mm&r=g)**Kenny**[July 10, 2017 at 8:14 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1063)
Hello! Equation 12 results in a scalar value….just one value as the result. But equation 14 involves covariance matrices, and equation 14 also has a ‘reciprocal’ symbol. Could you please explain whether equation 14 is feasible (correct)? That is, if we have covariance matrices, then it it even feasible to have a reciprocal term such as (sigma0 + sigma1)^-1 ?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1063#respond)↓ 
189.   ![Image 281](https://secure.gravatar.com/avatar/080c8e5d5e869140968f9969f4ff6916c7b3c5219fda067c490e68b411bea7b4?s=44&d=mm&r=g)**Kenny**[July 10, 2017 at 10:59 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1065)
Hello. I’d like to add…… when I meant reciprocal term in equation 14, I’m talking about (sigma0 + sigma1)^-1…. which appears to be 1/[sigma0 + sigma1]. But if sigma0 and sigma1 are matrices, then does that fractional reciprocal expression even make sense? Just interested to find out how that expression actually works, or how it is meant to be interpreted – in equation 14. Thanks.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1065#respond)↓ 
190.   ![Image 282](https://secure.gravatar.com/avatar/f26497e16664d12d027be81717f8164a6ec6109ad537e63e1cb3b866835f13ce?s=44&d=mm&r=g)**John Doe**[July 14, 2017 at 9:23 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1066)
Simply, Great Work!!

 Thank you so much :)

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1066#respond)↓ 
191.   ![Image 283](https://secure.gravatar.com/avatar/0c3807290af7496272bd66d46143d74b61057ae54ec1fd91e9693c11bb092094?s=44&d=mm&r=g)**yota**[July 16, 2017 at 12:29 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1067)
Nice article, it is the first time I go this far with kalman filtering (^_^;)

Would you mind to detail the content (and shape) of the Hk matrix, if the predict step have very detailed examples, with real Bk and Fk matrices, I’m a bit lost on the update step.

 What is Hk exactly, what if my mobile have two sensors for speed for example and one very noisy for position…

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1067#respond)↓ 
192.   ![Image 284](https://secure.gravatar.com/avatar/260554caa091bed26928856a494ca218e70b77dcb935bb1abb1bdd285ebea7d1?s=44&d=mm&r=g)**Jay**[July 17, 2017 at 1:41 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1068)
Wow..

 FINALLY found THE article that clear things up!

 Thanks for the awesome article!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1068#respond)↓ 
193.   ![Image 285](https://secure.gravatar.com/avatar/1d05e2eabd1c498d063ae87735208cbd3f6d2efc202a03d981f56b99956620cd?s=44&d=mm&r=g)**[Mohamed Belal](https://www.redbubble.com/people/teehome)**[July 18, 2017 at 8:34 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1069)
Very well explained, one of the best tutorials about KF so far, very easy to follow, you’ve perfectly clarified everything, thank you so much :)

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1069#respond)↓ 
194.   ![Image 286](https://secure.gravatar.com/avatar/080c8e5d5e869140968f9969f4ff6916c7b3c5219fda067c490e68b411bea7b4?s=44&d=mm&r=g)**Kenny**[July 28, 2017 at 6:32 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1072)
Finally found out the answer to my question, where I asked about how equations (12) and (13) convert to a matrix form of equation (14). The answer is …… it’s not a simple matter of taking (12) and (13) to get (14). The theory for obtaining a “kalman gain MATRIX” K is much more involved than just saying that (14) is the ‘matrix form’ of (12) and (13). So, if anybody here is confused about how (12) and (13) converts to (14) and (14), I don’t blame you, because the theory for that is not covered here.

This particular article, however….. is one of the best I’ve seen though. It is one that attempts to explain most of the theory in a way that people can understand and relate to.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1072#respond)↓ 
195.   ![Image 287](https://secure.gravatar.com/avatar/080c8e5d5e869140968f9969f4ff6916c7b3c5219fda067c490e68b411bea7b4?s=44&d=mm&r=g)**Kenny**[July 28, 2017 at 6:34 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1073)
Finally found out the answer to my question, where I asked about how equations (12) and (13) convert to a matrix form of equation (14). The answer is …… it’s not a simple matter of taking (12) and (13) to get (14). The theory for obtaining a “kalman gain MATRIX” K is much more involved than just saying that (14) is the ‘matrix form’ of (12) and (13). So, if anybody here is confused about how (12) and (13) converts to (14) and (15), I don’t blame you, because the theory for that is not covered here.

This particular article, however….. is one of the best I’ve seen though. It is one that attempts to explain most of the theory in a way that people can understand and relate to.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1073#respond)↓ 
196.   ![Image 288](https://secure.gravatar.com/avatar/e6d4c84e1f3de6e5cb6d64e630ad15f93c0c835bd94093b8a0997700332d02ab?s=44&d=mm&r=g)**Yang Ding**[July 30, 2017 at 3:32 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1074)
Thank you. :) Love your illustrations and explanations. Made things much more clear. Please draw more robots. XD

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1074#respond)↓ 
197.   ![Image 289](https://secure.gravatar.com/avatar/a5309cd008df5320d4be84c13563d856610d7951e42eb5c0cfdca40f248d5651?s=44&d=mm&r=g)**Timo**[August 5, 2017 at 7:45 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1075)
I only understand basic math and a lot of this went way over my head. I’m making a simple two wheel drive microcontroller based robot and it will have one of those dirt cheap 6-axis gyro/accelerometers. Was looking for a way to extract some sense and a way to combine this sensor data into meaningful data that can be used to steer the robot. There’re a lot of uncertainties and noise in such system and I knew someone somewhere had cracked the nut. Now I know at least some theory behind it and I’ll feel more confident using existing programming libraries that Implement these principles.

Even though I don’t understand all in this beautiful detailed explanation, I can see that it’s one of the most comprehensive. I appreciate your time and huge effort put into the subject. Bookmarked and looking forward to return to reread as many times as it takes to understand it piece by piece.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1075#respond)↓ 
198.   ![Image 290](https://secure.gravatar.com/avatar/42d712dfe085d67c1ccd4b0084aee4a2559b65c81fd690242adbb8e85333f75f?s=44&d=mm&r=g)**[Pu Huang](http://hp.stuhome.net/)**[August 15, 2017 at 8:26 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1076)
Great blog!! Thanks to your nice work!

 By the way, can I translate this blog into Chinese? Of course, I will put this original URL in my translated post. :)

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1076#respond)↓ 
199.   ![Image 291](https://secure.gravatar.com/avatar/d19f1f3d7972cfc17df58500dffb2792632ef4c142e7b6007ea60fe6792ee996?s=44&d=mm&r=g)**Arthur**[August 20, 2017 at 8:08 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1078)
Thank you! this clarified my question abou the state transition matrix. Most people may be satisfied with this explanation but I am not.

 I am still curious about examples of control matrices and control vectors – the explanation of which you were kind enough to gloss over in this introductory exposition.

 I have a lot of other questions and any help would be appreciated!

 I have a strong background in stats and engineering math and I have implemented K Filters and Ext K Filters and others as calculators and algorithms without a deep understanding of how they work. I would like to get a better understanding please with any help you can provide. Thank you!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1078#respond)↓ 
200.   ![Image 292](https://secure.gravatar.com/avatar/f9438d8bf338d297f081e3715347a27e430d49570177d22b5862f6b46e64cf96?s=44&d=mm&r=g)**Akhil Tiwari**[August 22, 2017 at 10:49 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1079)
what if we don’t have the initial velocity.

 yes i can use the coordinates ( from sensor/LiDAR ) of first two frame to find the velocity but that is again NOT completely reliable source

what should i do???

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1079#respond)↓ 
201.   ![Image 293](https://secure.gravatar.com/avatar/14d522a073f3905b17c5b5d996595de5af89cdcb994e989d7f9e0fc14d489625?s=44&d=mm&r=g)**apeksha vr**[August 23, 2017 at 10:43 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1080)
I did not understand what exactly is H matrix. Can you explain the difference between H,R,Z?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1080#respond)↓ 
202.   ![Image 294](https://secure.gravatar.com/avatar/c60a902c37e19e2004f51148ea1903010401f33fa5fe052a92bfad30e3c45bec?s=44&d=mm&r=g)**adeeb**[September 7, 2017 at 8:59 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1082)
i am doing my final year project on designing this estimator, and for starters, this is a good note and report ideal for seminar and self evaluating,. thanks admin for posting this gold knowledge. made easy for testing and understanding in a simple analogy. with great graphs and picture content. couldnt thank less. peace.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1082#respond)↓ 
203.   ![Image 295](https://secure.gravatar.com/avatar/0233ecd69b814e0ddaf9655510b470f1d33dd3ed78dc5d044b5a41a28864774b?s=44&d=mm&r=g)**Jiang**[September 13, 2017 at 12:33 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1084)
This is so helpful!!!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1084#respond)↓ 
204.   ![Image 296](https://secure.gravatar.com/avatar/080c8e5d5e869140968f9969f4ff6916c7b3c5219fda067c490e68b411bea7b4?s=44&d=mm&r=g)**Kenny**[September 27, 2017 at 7:43 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1086)
A big question here is …. in equation (6), why is the projection (ie. xk) calculated from the state matrix Fk (instead of F_k-1 ? Similarly? Why Bk and uk?

 If we’re trying to get xk, then shouldn’t xk be computed with F_k-1, B_k-1 and u_k-1? It is because, when we’re beginning at an initial time of k-1, and if we have x_k-1, then we should be using information available to use for projecting ahead…. which means F_k-1, B_k-1 and u_k-1, right? Not F_k, B_k and u_k.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1086#respond)↓ 
    1.   ![Image 297](https://secure.gravatar.com/avatar/04bacec2489854dc64f60162c989d2bc5f48720522d85c2166c90328460746e5?s=44&d=mm&r=g)**tbabb**Post author[September 28, 2017 at 10:47 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1087)
F_{k} is defined to be the matrix that transitions the state from x_{k-1} to x_{k}. We could label it F_{k-1} and it would make no difference, so long as it carried the same meaning.

Similarly B_k is the matrix that adjusts the final system state at time k based on the control inputs that happened over the time interval between k-1 and k. We could label it however we please; the important point is that our new state vector contains the correctly-predicted state for time k.

We also don’t make any requirements about the “order” of the approximation; we could assume constant forces or linear forces, or something more advanced. The only requirement is that the adjustment be represented as a matrix function of the control vector.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1087#respond)↓ 
        1.   ![Image 298](https://secure.gravatar.com/avatar/080c8e5d5e869140968f9969f4ff6916c7b3c5219fda067c490e68b411bea7b4?s=44&d=mm&r=g)**Kenny**[September 29, 2017 at 3:45 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1088)
Hi tbabb! Thanks for your kind reply. And thanks very much for explaining. I was only coming from the discrete time state space pattern:

 x[k+1] = Ax[k] + Bu[k]. I assumed that A is Ak, and B is Bk.

 Then, when re-arranging the above, we get:

 x[k] = Ax[k-1] + Bu[k-1]. I assumed here that A is A_k-1 and B is B_k-1. This suggests order is important. But, on the other hand, as long as everything is defined …. then that’s ok. Thanks again! Nice site, and nice work.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1088#respond)↓ 

205.   ![Image 299](https://secure.gravatar.com/avatar/f27c30fdc4686647ff4cb690573e7d20d0b22d4d14e8caa3574e3ccbea7e3fb0?s=44&d=mm&r=g)**Bhaskar**[October 8, 2017 at 4:39 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1089)
The article was really great. It helped me understand KF much better. But I still have a doubt about how you visualize senor reading after eq 8. There are two visualizations, one in pink color and next one in green color. Can you explain the relation/difference between the two ?

 Thanks in advance.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1089#respond)↓ 
206.   ![Image 300](https://secure.gravatar.com/avatar/a4fe1f0d2c60137fc9eefc943a720848cd11ceed68b5727ed5970c97a4e399b3?s=44&d=mm&r=g)**Gore Shilpa**[October 11, 2017 at 5:56 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1091)
Needless to say, concept has been articulated well and serves it purpose really well!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1091#respond)↓ 
207.   ![Image 301](https://secure.gravatar.com/avatar/56605f9c851745f8657101874c2df38923db14c5fb8d9e26cd8cde36b8f6b840?s=44&d=mm&r=g)**om**[October 13, 2017 at 10:24 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1092)
I could get how matrix Rk got introduced suudenly

(μ1,Σ1)=(zk→,Rk) .

 I think I need read it again,

 Explanation of Kalman Gain is superb.

 Thanks a lot

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1092#respond)↓ 
208.   ![Image 302](https://secure.gravatar.com/avatar/3210ac4088c00e6126864f92149dd36eee83ef0322625a92a96f3d3de7beb836?s=44&d=mm&r=g)**PG**[October 25, 2017 at 4:23 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1095)
The explanation is great but I would like to point out one source of confusion which threw me off. P_k should be the co-variance of the actual state and the truth and not co-variance of the actual state x_k. This will make more sense when you try deriving (5) with a forcing function.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1095#respond)↓ 
209.   ![Image 303](https://secure.gravatar.com/avatar/047aed7ef7e79945ee185a2ca953db33e584707d0c94412909ed44281c5a04c4?s=44&d=mm&r=g)**Mohan**[October 27, 2017 at 1:17 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1096)
Superb ! Very simply and nicely put. Thanks a lot !!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1096#respond)↓ 
210.   ![Image 304](https://secure.gravatar.com/avatar/7402a0586b5d0a98a462790eb5b3c38319d302e34a3e42053eff84c6c681dd1c?s=44&d=mm&r=g)**Paige**[October 31, 2017 at 11:18 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1097)
This is, by far, the best tutorial on Kalman filters I’ve found. You provided the perfect balance between intuition and rigorous math. Thank you :)

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1097#respond)↓ 
211.   ![Image 305](https://secure.gravatar.com/avatar/0e60595653d9cf308d178d5ec008caf61338ca439ff8870af92076e8fd891c4b?s=44&d=mm&r=g)**Scott**[November 2, 2017 at 4:24 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1098)
Hello, thank you for this great article. I followed it and would like to code something up but I am stopped at the computation of the Covariance matrix. I understand that each summation is integration of one of these: (x*x)* Gaussian, (x*v)*Gaussian, or (v*v)*Gaussian . I can use integration by parts to get down to integration of the Gaussian but then I run into the fact that it seems to be an integral that wants to result in the Error function, but the bounds don’t match. It only works if bounds are 0 to inf, not –inf to inf. So I am unable to integrate to form the Covariance matrix. Could you please point me in the right direction. Thanks!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1098#respond)↓ 
212.   ![Image 306](https://secure.gravatar.com/avatar/43f728a40af3cb46fa04d42141344e3b96c61c069197b86e8898d9edf089213c?s=44&d=mm&r=g)**Beiming**[November 19, 2017 at 2:16 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1104)
Now i understood, you are great!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1104#respond)↓ 
213.   ![Image 307](https://secure.gravatar.com/avatar/3dfe0c9534c67f631ef7e55c56c8b6787359eb05591161b438e51d644a14cf27?s=44&d=mm&r=g)**Yadviga**[November 27, 2017 at 10:16 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1106)
Great Job!!! Really the best explonation of Kalman Filter ever! Now my world is clear xD Is really not so scary as it’s shown on Wiki or other sources! Thank You very much!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1106#respond)↓ 
214.   ![Image 308](https://secure.gravatar.com/avatar/f9a2b87d7b508aa018577f7b05cc058e1de7315d06ed8efa9ebf171c74d775c1?s=44&d=mm&r=g)**Angelia**[November 30, 2017 at 3:02 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1107)
hi, i would like to ask if it possible to add the uncertainty in term of magnetometer, gyroscope and accelerometer into the kalman filter?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1107#respond)↓ 
215.   ![Image 309](https://secure.gravatar.com/avatar/36e49d8dbdff156898878aefaf03b66b1797e6a2e4fa0c3896da8f1f504d54c1?s=44&d=mm&r=g)**Rob Snell**[December 4, 2017 at 4:32 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1109)
Wow, fantastic article.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1109#respond)↓ 
216.   ![Image 310](https://secure.gravatar.com/avatar/70296af385f401364752964ecc2930b92370ce7b1aad45f86fb597b3523d3a0b?s=44&d=mm&r=g)**Srinivas**[December 12, 2017 at 11:07 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1110)
Very neat! Thanks for this article.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1110#respond)↓ 
217.   ![Image 311](https://secure.gravatar.com/avatar/27cb8b7e61f3d7e1cc2b8ee96f19485d2710fa7524c60bb96ca4b8b9ae05433c?s=44&d=mm&r=g)**Michael Breuker**[December 19, 2017 at 7:29 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1121)
Excellent article and very clear explanations. I love your graphics. Thank you very much.

 I really would like to read a follow-up about Unscented KF or Extended KF from you.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1121#respond)↓ 
218.   ![Image 312](https://secure.gravatar.com/avatar/5875466fcc30bd380feb026448ddea6e26906a9f37f17fab5dfc467a8b968585?s=44&d=mm&r=g)**Alex**[December 21, 2017 at 12:43 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1125)
Thanks for this article. Super! Simple and clear!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1125#respond)↓ 
219.   ![Image 313](https://secure.gravatar.com/avatar/15948d9a8aaa7f48cbc586c38ad6bd326e4d451dbbb54f2bf7184f29353a3b7b?s=44&d=mm&r=g)**odyxanthi**[December 27, 2017 at 11:22 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1126)
Thanks for your article, you ‘ve done a great job mixing the intuitive explanation with the mathematical formality. Now I can finally understand what each element in the equation represents.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1126#respond)↓ 
220.   ![Image 314](https://secure.gravatar.com/avatar/f928b8497c0b0b812562d120693faf996717c7db24b402000d8e2ed318bbe02d?s=44&d=mm&r=g)**xuesen**[December 31, 2017 at 4:36 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1127)
In “Combining Gaussians” section, why is the multiplication of two normal distributions also a normal distribution. This doesn’t seems right if the two normal distributions are not independent.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1127#respond)↓ 
221.   ![Image 315](https://secure.gravatar.com/avatar/c61acebd0a548eace31c6d8d2de6c04f3d12dab8bedce9cb92c8bdb36a2f96e7?s=44&d=mm&r=g)**giatorta**[January 18, 2018 at 1:57 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1129)
really great post: easy to understand but mathematically precise and correct. Thank you!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1129#respond)↓ 
222.   ![Image 316](https://secure.gravatar.com/avatar/d1645ce4522871e8da6c697816d78d720bc1005ce7efaebfd91fa1574d59ba8d?s=44&d=mm&r=g)**Ananthapadmanabha**[January 26, 2018 at 6:52 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1131)
Very great explaination and really very intuitive. excited to see your other posts from now on.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1131#respond)↓ 
223.   ![Image 317](https://secure.gravatar.com/avatar/459101174b9fa463d4a14414397a143a1780c087813edfa92dc1bbb36eb8eb40?s=44&d=mm&r=g)**Josephine**[January 27, 2018 at 3:39 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1132)
Informative Article.. It will be great if you provide the exact size it occupies on RAM,efficiency in percentage, execution of algorithm

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1132#respond)↓ 
224.   ![Image 318](https://secure.gravatar.com/avatar/dfb81cffcd53ba9b36c8a38419e1307ea08f9b0bc5e96d1c555b789734ed86e5?s=44&d=mm&r=g)**El Barcho**[January 29, 2018 at 1:52 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1133)
so great article, I have question about equation (11) and (12). could you explain it or another source that i can read?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1133#respond)↓ 
225.   ![Image 319](https://secure.gravatar.com/avatar/48d340c07192dbd1adc6580c1abef7e54c6bc664362f9b97b80d74f4c41ddfe3?s=44&d=mm&r=g)**Xinrui Wang**[January 30, 2018 at 11:49 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1134)
Fantastic! Thanks for your explanation!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1134#respond)↓ 
226.   ![Image 320](https://secure.gravatar.com/avatar/8e3bd96ae6d706bdae5beb0ba61c75fde75832de194962020d5656b546de3e8f?s=44&d=mm&r=g)**robert**[February 2, 2018 at 2:32 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1135)
” (being careful to renormalize, so that the total probability is 1) ”

 Can someone be kind enough to explain that part to me ? How do you normalize a Gaussian distribution ? Sorry for the newby question, trying to undertand the math a bit.

Thanks in advance

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1135#respond)↓ 
    1.   ![Image 321](https://secure.gravatar.com/avatar/7ae25411d11853c2331dd44af69951581441a08a5fe5aeab9f34228619a28835?s=44&d=mm&r=g)**Joseph Cluever**[February 14, 2018 at 6:17 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1142)
The integral of a distribution over it’s domain has to be 1 by definition. Also, I don’t know if that comment in the blog is really necessary because if you have the covariance matrix of a multivariate normal, the normalizing constant is known: det(2*pi*(Covariance Matrix))^(-1/2). There’s nothing to really be careful about. See [https://en.wikipedia.org/wiki/Multivariate_normal_distribution](https://en.wikipedia.org/wiki/Multivariate_normal_distribution)

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1142#respond)↓ 

227.   ![Image 322](https://secure.gravatar.com/avatar/9d8fd9ee6f2549ffcfe6a92ad9e95cff2f320215fbf5f86b1638b332d7604d11?s=44&d=mm&r=g)**Nathaniel Groendyk**[February 9, 2018 at 1:50 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1140)
Amazing article! Very impressed! You must have spent some time on it, thank you for this!

I had one quick question about Matrix H. Can it be extended to have more sensors and states? For example say we had 3 sensors, and the same 2 states, would the H matrix look like this:

 H = [ [Sensor1-to-State 1(vel) conversion Eq , Sensor1-to-State 2(pos) conversion Eq ] ;

 [Sensor2-to-State 1(vel) conversion Eq , Sensor2-to-State 2(pos) conversion Eq ] ;

 [Sensor3-to-State 1(vel) conversion Eq , Sensor3-to-State 2(pos) conversion Eq ] ]

Thank you!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1140#respond)↓ 
228.   ![Image 323](https://secure.gravatar.com/avatar/32f5a0b29199447304c9033452adcd669ff51ddd5b765da454627b18305c7c5d?s=44&d=mm&r=g)**Sasanka Kuruppuarachchi**[February 21, 2018 at 5:44 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1143)
Simply love it.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1143#respond)↓ 
229.   ![Image 324](https://secure.gravatar.com/avatar/3713ab76f948481975bf818bff2b91579a526e4194f40b01d17142e5ee3a24fd?s=44&d=mm&r=g)**hamza**[February 23, 2018 at 9:54 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1144)
Hey Author,

 Good work. Can you elaborate how equation 4 and equation 3 are combined to give updated covariance matrix?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1144#respond)↓ 
    1.   ![Image 325](https://secure.gravatar.com/avatar/04bacec2489854dc64f60162c989d2bc5f48720522d85c2166c90328460746e5?s=44&d=mm&r=g)**tbabb**Post author[February 23, 2018 at 7:51 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1145)
F_k is a matrix applied to a random vector x_{k-1} with covariance P_{k-1}. Equation (4) says what we do to the covariance of a random vector when we multiply it by a matrix.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1145#respond)↓ 

230.   ![Image 326](https://secure.gravatar.com/avatar/ea9e6dfa28af28f6f96bb3fb3f95033d3c82d161062253414b6605efeee8dc14?s=44&d=mm&r=g)**Ankit Swarnkar**[February 27, 2018 at 9:22 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1147)
Simply Awesome!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1147#respond)↓ 
231.   ![Image 327](https://secure.gravatar.com/avatar/4788ede223aabb4f7e89194b7bdb886448048cff63ed365dcd6add76aad30e94?s=44&d=mm&r=g)**Sangyun Han**[March 6, 2018 at 1:35 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1148)
This article is the best one about Kalman filter ever. Thanks for your help.

But I have a question about how to do knock off Hk in equation (16), (17).

 Because usual case Hk is not invertible matrix, so i think knocking off Hk is not possible.

 Can you explain?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1148#respond)↓ 
232.   ![Image 328](https://secure.gravatar.com/avatar/02b23494874dcbfc1bd4a6eb7ecfccc4f9cac1fb615a65225d9810a77655ebad?s=44&d=mm&r=g)**Dasarath S**[March 7, 2018 at 1:19 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1149)
Mind Blown !! The fact that you perfectly described the reationship between math and real world is really good. Thnaks a lot!!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1149#respond)↓ 
233.   ![Image 329](https://secure.gravatar.com/avatar/577bc0a76d636d327a54e3f506c5ef225709f9cbc3ea9136461b12cf1e16818f?s=44&d=mm&r=g)**P P BANERJEE**[March 10, 2018 at 7:42 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1150)
Can this method be used accurately to predict the future position if the movement is random like Brownian motion.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1150#respond)↓ 
    1.   ![Image 330](https://secure.gravatar.com/avatar/04bacec2489854dc64f60162c989d2bc5f48720522d85c2166c90328460746e5?s=44&d=mm&r=g)**tbabb**Post author[March 12, 2018 at 6:02 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1151)
If you have sensors or measurements providing some current information about the position of your system, then sure.

In the case of Brownian motion, your prediction step would leave the position estimate alone, and simply widen the covariance estimate with time by adding a constant Q_k representing the rate of diffusion. Your measurement update step would then tell you to where the system had advanced.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1151#respond)↓ 

234.   ![Image 331](https://secure.gravatar.com/avatar/5a0cb997c0f2c388943292154bb5cce13f93e657dcd571d318b06f64bb880ab4?s=44&d=mm&r=g)**Lorenzo**[March 13, 2018 at 10:24 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1152)
It is an amazing article, thank you so much for that!!!!!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1152#respond)↓ 
235.   ![Image 332](https://secure.gravatar.com/avatar/a5f3613bbf02886af9a14997c05ef823df0faaae340299edfe37765e40320d43?s=44&d=mm&r=g)**salma rv**[March 17, 2018 at 6:28 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1153)
Is the method useful for biological samples variations from region to region

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1153#respond)↓ 
236.   ![Image 333](https://secure.gravatar.com/avatar/16c7320828a24dddfe63aa801f4e97ae70bd3716b4cb4cfea82334c6da473658?s=44&d=mm&r=g)**João Escusa**[March 21, 2018 at 12:05 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1154)
Hello.

I’m trying to implement a Kalman filter for my thesis ut I’ve never heard of it and have some questions.

 I save the GPS data of latitude, longitude, altitude and speed. So my position is not a variable, so to speak, it’s a state made of 4 variables if one includes the speed. Data is acquired every second, so whenever I do a test I end up with a large vector with all the information.

How does one calculate the covariance and the mean in this case? Probabilities have never been my strong suit.

Thanks.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1154#respond)↓ 
    1.   ![Image 334](https://secure.gravatar.com/avatar/04bacec2489854dc64f60162c989d2bc5f48720522d85c2166c90328460746e5?s=44&d=mm&r=g)**tbabb**Post author[March 22, 2018 at 2:17 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1155)
Take many measurements with your GPS in circumstances where you know the “true” answer. This will produce a bunch of state vectors, as you describe. Find the difference of these vectors from the “true” answer to get a bunch of vectors which represent the typical noise of your GPS system. Then [calculate the sample covariance](https://en.wikipedia.org/wiki/Covariance#Calculating_the_sample_covariance) on that set of vectors. That will give you R_k, the sensor noise covariance.

You can estimate Q_k, the process covariance, using an analogous process.

Note that to meaningfully improve your GPS estimate, you need some “external” information, like control inputs, knowledge of the process which is moving your vehicle, or data from other, separate inertial sensors. Running Kalman on _only_ data from a single GPS sensor probably won’t do much, as the GPS chip likely uses Kalman internally anyway, and you wouldn’t be adding anything!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1155#respond)↓ 

237.   ![Image 335](https://secure.gravatar.com/avatar/715b45e3d9528bcff275f204737012bec6baf2eb936a24b9cfb0510cd634e61b?s=44&d=mm&r=g)**Yar Zar**[April 28, 2018 at 7:50 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1159)
Well explanation! Thank you so much!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1159#respond)↓ 
238.   ![Image 336](https://secure.gravatar.com/avatar/4cb0c14fcc3ebde7ea08cb79d2e401e8333d7cd3546c4bf36534ccefb4bf77e2?s=44&d=mm&r=g)**Vladimir**[May 7, 2018 at 8:19 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1160)
Many thanks!

 I’ve never seen such a clear and passionate explanation.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1160#respond)↓ 
239.   ![Image 337](https://secure.gravatar.com/avatar/87555c8ca8fb0e8fed370cd10173ba13d4936e1816d4f3e496c4295d7dc9ada9?s=44&d=mm&r=g)**Di**[May 17, 2018 at 3:38 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1161)
Excellent explanation. Thank you!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1161#respond)↓ 
240.   ![Image 338](https://secure.gravatar.com/avatar/ff70ffee66bf4f125f081ca7cc842eb8205b1d77c5f06fb2b32f4c8c4ddb9ce6?s=44&d=mm&r=g)**P**[February 23, 2019 at 3:43 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1169)
Great tutorial! Thanks! :D

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1169#respond)↓ 
241.   ![Image 339](https://secure.gravatar.com/avatar/9df7d3141fc98962502c2953dac65c1139b59992dd79ad4442c168815923a3f9?s=44&d=mm&r=g)**Grant**[March 14, 2019 at 11:16 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1173)
FANTASTIC explanation! Just EPIC:-)

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1173#respond)↓ 
242.   ![Image 340](https://secure.gravatar.com/avatar/ecbb05807b310f9a82b76e0fbdc7538ca7250dba60c7a52d939949802e774045?s=44&d=mm&r=g)**Steve**[March 20, 2019 at 9:50 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1174)
Agree with Grant, this is a fantastic explanation, please do your piece on extended KF’s – non linear systems is what I’m looking at!!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1174#respond)↓ 
243.   ![Image 341](https://secure.gravatar.com/avatar/a8d72c0b4cf9d73f3339f101234ff9c8f48f601b3c217d3654fbbdb2489a0a1f?s=44&d=mm&r=g)**modar**[March 25, 2019 at 4:35 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1175)
Perfect ,easy and insightful explanation; thanks a lot.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1175#respond)↓ 
244.   ![Image 342](https://secure.gravatar.com/avatar/e38389bd91c1fabf32fffe3fd3109f137801ca0040226f4815b0681d121b2651?s=44&d=mm&r=g)**Eranga De Silva**[April 3, 2019 at 3:35 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1177)
Thank you VERY much for this nice and clear explanation

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1177#respond)↓ 
245.   ![Image 343](https://secure.gravatar.com/avatar/d364105e8655ab50d234035975e820ef03478039feadb1b5a72600addee7e040?s=44&d=mm&r=g)**Will**[April 27, 2019 at 2:28 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1178)
That was an amazing post! Thank you so much for the wonderful explanation!

As a side note, the link in the final reference is no longer up-to-date. Now it seems this is the correct link: [https://drive.google.com/file/d/1nVtDUrfcBN9zwKlGuAclK-F8Gnf2M_to/view](https://drive.google.com/file/d/1nVtDUrfcBN9zwKlGuAclK-F8Gnf2M_to/view)

Once again, congratz on the amazing post!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1178#respond)↓ 
246.   ![Image 344](https://secure.gravatar.com/avatar/5e8fd9312dd0e5647ae28a5de40035d0529a707dae5c095a26a0b6980c29c5cd?s=44&d=mm&r=g)**cle323**[May 16, 2019 at 4:41 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1180)
THANK YOU !!

After spending 3 days on internet, I was lost and confused. Your explanation is very clear ! Nice job

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1180#respond)↓ 
247.   ![Image 345](https://secure.gravatar.com/avatar/c3b9831dd810327dd692f41a2f1f3b495525773fbeba5a8b2f02c2a11f76ac74?s=44&d=mm&r=g)**Richard**[May 26, 2019 at 4:59 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1181)
This was very clear until I got to equation 5 where you introduce P without saying what is it and how its prediction equation relates to multiplying everything in a covariance matrix by A.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1181#respond)↓ 
248.   ![Image 346](https://secure.gravatar.com/avatar/c3b9831dd810327dd692f41a2f1f3b495525773fbeba5a8b2f02c2a11f76ac74?s=44&d=mm&r=g)**Richard**[May 26, 2019 at 5:06 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1182)
Sorry, ignore previous comment. I’ve traced back and found it.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1182#respond)↓ 
249.   ![Image 347](https://secure.gravatar.com/avatar/e49c1f442e37e29bc0e600a3312179d2e1ae17c77f475dbfc33971eb939c0de3?s=44&d=mm&r=g)**孙凯道**[May 30, 2019 at 10:22 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1183)
THANK YOU

 Such a meticulous post gave me a lot of help.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1183#respond)↓ 
250.   ![Image 348](https://secure.gravatar.com/avatar/64128c5ef6b7a73a0f93869ca584f60cb88248ac5210b9185296f8eb5c696990?s=44&d=mm&r=g)**Monty**[June 15, 2019 at 2:44 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1184)
So it seems it’s interpolating state from prediction and state from measurement. H x_meas = z. Doesn’t seem like x_meas is unique.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1184#respond)↓ 
251.   ![Image 349](https://secure.gravatar.com/avatar/64f398bd4d4119762cb39ff80ff6e71f9020bf1cf51b00c58cc318241c724e51?s=44&d=mm&r=g)**Maxim**[July 16, 2019 at 12:34 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1186)
Thanks for the post.

 I still have few questions.

1. At eq. (5) you put evolution as a motion without acceleration. At eq. 5 you add acceleration and put it as some external force. But it is not clear why you separate acceleration, as it is also a part of kinematic equation. So, the question is what is F and what is B. Can/should I put acceleration in F?

2. At eq. 7 you update P with F, but not with B, despite the x is updated with both F & B. Why?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1186#respond)↓ 
    1.   ![Image 350](https://secure.gravatar.com/avatar/04bacec2489854dc64f60162c989d2bc5f48720522d85c2166c90328460746e5?s=44&d=mm&r=g)**tbabb**Post author[July 16, 2019 at 5:32 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1187)
1. The state of the system (in this example) contains only position and velocity, which tells us nothing about acceleration. F is a matrix that acts on the state, so everything it tells us must be a function of the state alone. If our system state had something that affected acceleration (for example, maybe we are tracking a model rocket, and we want to include the thrust of the engine in our state estimate), then F could both account for and change the acceleration in the update step. Otherwise, things that do not depend on the state _x_ go in B.

2. P represents the covariance of our state— how the possibilities are balanced around the mean. B affects the mean, but it does not affect the balance of states _around_ the mean, so it does not matter in the calculation of P. This is because B does not depend on the state, so adding B is like adding a constant, which does not distort the _shape_ of the distribution of states we are tracking.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1187#respond)↓ 

252.   ![Image 351](https://secure.gravatar.com/avatar/73e25c04cc4a5c2c3f164e46d728f1575fe8d7cf8c3f4279227a01829181d5ba?s=44&d=mm&r=g)**Abdul Basit**[July 17, 2019 at 12:25 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1188)
Great intuition, I am bit confuse how Kalman filter works. But this blog clear my mind and I am able to understand Computer Vision Tracking algorithms.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1188#respond)↓ 
253.   ![Image 352](https://secure.gravatar.com/avatar/64128c5ef6b7a73a0f93869ca584f60cb88248ac5210b9185296f8eb5c696990?s=44&d=mm&r=g)**Monty**[August 22, 2019 at 8:16 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1192)
My issue is with you plucking H’s off of this:

 H x’ = H x + H K (z – H x)

 x’ = x + K (z – H x) <- we know this is true from a more rigorous derivation

H isn't generally invertible. For sure you can go the other way by adding H back in. However, I do like this explaination.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1192#respond)↓ 
254.   ![Image 353](https://secure.gravatar.com/avatar/6282169d1d8ce08ca28f20a18d93a05810e9d979ba096655a0256583b9a31d30?s=44&d=mm&r=g)**Abdelrhman**[September 20, 2019 at 4:17 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1194)
Thanks alot for this, it’s really the best explanation i’ve seen for the Kalman filter. visualization with the idea of merging gaussians for the correction/update step and to find out where the kalman gain “K” came from is very informative.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1194#respond)↓ 
255.   ![Image 354](https://secure.gravatar.com/avatar/7781f2641908df08139f078ec8baa5497664ca3b70de7bc2c1ce027049df05bc?s=44&d=mm&r=g)**Kimon**[September 23, 2019 at 9:45 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1195)
Is there a way to combine sensor measurements where each of the sensors has a different latency? How does one handle that type of situation?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1195#respond)↓ 
256.   ![Image 355](https://secure.gravatar.com/avatar/b3ac03d456b497eebe410c80df0b21ed291bb74eb5700c30a8121e4b75bacf0f?s=44&d=mm&r=g)**David Sorcman**[October 16, 2019 at 7:56 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1197)
This is the best explanation of KF that I have ever seen, even after graduate school.

Just a warning though – in Equation 10, the “==?” should be “not equals” – the product of two Gaussians is not a Gaussian. See [http://mathworld.wolfram.com/NormalProductDistribution.html](http://mathworld.wolfram.com/NormalProductDistribution.html) for the actual distribution, which involves the Ksub0 Bessel function. The expressions for the variance are correct, but not the implication about the pdf.

Also, since position has 3 components (one each along the x, y, and z axes), and ditto for velocity, the actual pdf becomes even more complicated. See the above link for the pdf for details in the 3 variable case.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1197#respond)↓ 
    1.   ![Image 356](https://secure.gravatar.com/avatar/04bacec2489854dc64f60162c989d2bc5f48720522d85c2166c90328460746e5?s=44&d=mm&r=g)**tbabb**Post author[November 1, 2019 at 12:00 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1198)
See my other replies above: The product of two Gaussian PDFs is indeed a Gaussian. The PDF of the product of two Gaussian-distributed variables is the distribution you linked. For this application we need the former; the probability that two random independent events are simultaneously true.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1198#respond)↓ 

257.   ![Image 357](https://secure.gravatar.com/avatar/7d08686ea91be3ad7307453d2757055a65b41a924c88aaa19146f4a0fd1f18fc?s=44&d=mm&r=g)**Arye**[November 12, 2019 at 8:23 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1199)
Great Article!

 I have some questions: Where do I get the Qk and Rk from? Do I model them? How do I update them?

 Thanks!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1199#respond)↓ 
258.   ![Image 358](https://secure.gravatar.com/avatar/073a1434c19a0a1ffa259012b45ac933d09e20e35f54548ce470f11c6bbf9a6e?s=44&d=mm&r=g)**Mariana Jimenez**[November 18, 2019 at 6:15 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1200)
Thank you very much ! Great article

 I’ve been struggling a lot to understand the KF and this has given me a much better idea of how it works.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1200#respond)↓ 
259.   ![Image 359](https://secure.gravatar.com/avatar/739694869e7088bdd0787858539e1a11c97d32c24f41c7730843455223db39d8?s=44&d=mm&r=g)**Ryder**[November 21, 2019 at 6:15 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1201)
There’s a few things that are contradiction to what this paper [https://arxiv.org/abs/1710.04055](https://arxiv.org/abs/1710.04055) says about Kalman filtering:

“The Kalman filter assumes that both variables (postion and velocity, in our case) are random and Gaussian distributed”

 – Kalman filter only assumes that both variables are uncorrelated (which is a weaker assumption that independent). Kalman filters can be used with variables that have other distributions besides the normal distribution

“In the above picture, position and velocity are uncorrelated, which means that the state of one variable tells you nothing about what the other might be.”

 – I think this a better description of what independence means that uncorrelated. Again, check out p. 13 of the Appendix of the reference paper by Y Pei et Al.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1201#respond)↓ 
260.   ![Image 360](https://secure.gravatar.com/avatar/4b9553bfc79a50712fdbdf9e0838f2aaf5d0c139e0678576c750de0a8cfbe31d?s=44&d=mm&r=g)**Dmitry**[November 22, 2019 at 2:05 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1202)
Great article, finally I got understanding of the Kalman filter and how it works.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1202#respond)↓ 
261.   ![Image 361](https://secure.gravatar.com/avatar/596c6911af51fc6e3a5135e3deb101ff4f64d603675947c738ab9fc0a980433b?s=44&d=mm&r=g)**Vlad**[February 14, 2020 at 12:49 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1207)
This was such a great article. Really good job!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1207#respond)↓ 
262.   ![Image 362](https://secure.gravatar.com/avatar/fcdcd4691c22ca2b58d3df419c0488327c09ccd0e2409f54f106aef4ab9a872d?s=44&d=mm&r=g)**Nishant Jain**[February 21, 2020 at 8:30 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1208)
How do we get Qk and Hk matrices?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1208#respond)↓ 
263.   ![Image 363](https://secure.gravatar.com/avatar/25b15e09f86a2f3eba59e91a6a72d96c20f8a9dd1ba657462b2aa83ce22ca1c9?s=44&d=mm&r=g)**Yiding Yang**[March 4, 2020 at 9:06 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1209)
This is an amazing tutorial. Thanks!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1209#respond)↓ 
264.   ![Image 364](https://secure.gravatar.com/avatar/58fb321a63779e3e2c4abe832c145d9e6f71d40d43fb94174470649e3f7e5f51?s=44&d=mm&r=g)**Lepper**[April 7, 2020 at 3:06 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1211)
I have one question regarding state vector; what is the position? i would say it is [x, y, v], right? in this case how looks the prediction matrix? thanks!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1211#respond)↓ 
265.   ![Image 365](https://secure.gravatar.com/avatar/7a9d065bda0dbf715768f3adceacf9cf501a7b3b6fd722f895b707a231a173c4?s=44&d=mm&r=g)**Oussama**[April 14, 2020 at 8:48 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1212)
Thanks, I think it was simple and cool as an introduction of KF

really appreciate reading it

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1212#respond)↓ 
266.   ![Image 366](https://secure.gravatar.com/avatar/ac361f6dd7aaccf4ee0c6b2ba22287daacca287ec9a0d6ecbee656e29bb54999?s=44&d=mm&r=g)**Om Kulkarni**[May 15, 2020 at 10:44 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1216)
I stumbled upon this article while learning autonomous mobile robots and I am completely blown away by this. The fact that an algorithm which I first thought was so boring could turn out to be so intuitive is just simply breathtaking.

Thank you for this article and I hope to be a part of many more.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1216#respond)↓ 
267.   ![Image 367](https://secure.gravatar.com/avatar/8a80c69bee1c70ab6126dcc00014041deec600dd2ca787580ef9dfb1578a88ce?s=44&d=mm&r=g)**Diego**[May 21, 2020 at 11:11 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1217)
Hi ,

 I have never seen a very well and simple explanation as yours . It is amazing thanks a lot.

 I have a question ¿ How can I get Q and R Matrix ?

Thanks again.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1217#respond)↓ 
268.   ![Image 368](https://secure.gravatar.com/avatar/cc567a322c5d763711ff9de6061b623b1f5813eade2982ff3d95ebfc03cb14d8?s=44&d=mm&r=g)**David Bellomo**[May 22, 2020 at 3:49 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1218)
This tool is one of my cornerstones for my Thesis, I have beeing struggling to understand the math behind this topic for more thant I whish. Your article is just amazing, shows the level of mastery you have on the topic since you can bring the maths an a level that is understandable by anyone. This is a tremendous boost to my Thesis, I cannot thank you enough for this work you did.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1218#respond)↓ 
269.   ![Image 369](https://secure.gravatar.com/avatar/6fc82c4fed68d3876e7dc514c04a9138b62186ce0021b8ba8ae1e82059026542?s=44&d=mm&r=g)**[Narendiran Chembu](http://cgnarendiran.github.io/)**[June 5, 2020 at 7:38 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1219)
Amazing Job. Thank you! :)

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1219#respond)↓ 
270.   ![Image 370](https://secure.gravatar.com/avatar/c34d5c0df8e9b1d9f47d392d1bc08abf836d46979048776531ed18678cf8a575?s=44&d=mm&r=g)**Diego Burgos**[August 7, 2020 at 2:27 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1223)
Hi, thanks in advance for such a good post, I want to ask you how you deduce the equation (5) given (4), I will stick to your answer.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1223#respond)↓ 
271.   ![Image 371](https://secure.gravatar.com/avatar/81da7b6724dd9d733af23ed8fd7ad70224dac1ce096baa762fc7069d33f7dad1?s=44&d=mm&r=g)**Rajat Mehta**[August 25, 2020 at 4:33 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1224)
One of the best intuitive explanation for Kalman Filter. Thanks for the amazing post.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1224#respond)↓ 
272.   ![Image 372](https://secure.gravatar.com/avatar/73fdf2f4ddce6791da1a1e54f5e61b5f6b23ee7a7a994d017b216742cb696d40?s=44&d=mm&r=g)**[Frederick C. Monson, PhD](http://n/A)**[August 25, 2020 at 3:31 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1225)
In the first set in a SEM I worked, there was button for a “Kalman” image adjustment. No one could explain what it was doing. Now, in the absence of calculous, I can present SEM users to use this help.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1225#respond)↓ 
273.   ![Image 373](https://secure.gravatar.com/avatar/eb2a02257bd75782da4f17c3fb92976d3c85fdf0998ae1ace509fe644c46b789?s=44&d=mm&r=g)**eya**[September 14, 2020 at 12:22 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1227)
thank you it is very clear and helpful

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1227#respond)↓ 
274.   ![Image 374](https://secure.gravatar.com/avatar/7ddd445268718d4c66b3d45cffb5ad6fb17f53f4c500832e7527d2fccdc295ee?s=44&d=mm&r=g)**Francisca**[October 20, 2020 at 8:33 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1229)
I Loved how you used the colors!!! Very clear thank yoy

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1229#respond)↓ 
275.   ![Image 375](https://secure.gravatar.com/avatar/3733eb9b1babc07d59c0158e4d6b0d17769bad90d4de4ea7ea5d46063b69e7de?s=44&d=mm&r=g)**Hojae**[November 9, 2020 at 5:54 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1230)
Thank you. it helps me a lot.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1230#respond)↓ 
276.   ![Image 376](https://secure.gravatar.com/avatar/42225f8d6d0799afb428e3c10c4ed66719e7c19d2ea69b26026fdf8bebb00a8d?s=44&d=mm&r=g)**T. K. Prasad**[November 19, 2020 at 11:34 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1232)
Excellent blog!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1232#respond)↓ 
277.   ![Image 377](https://secure.gravatar.com/avatar/2a66abfeb4f5697c139b9acc8ce24546058bdfa86b49297065aefe9a90b58e5a?s=44&d=mm&r=g)**YT Tseng**[January 1, 2021 at 7:20 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1235)
Thank you tbabb! It is a very nice tutorial!

 I have a question.

In equation15, you demonstrated the multiplication of the following two Gaussian distribution:

 mu_0 = Hk Xk_hat

 sigma_0 = Hk Pk Hk^T

 and

 mu_1 = zk

 sigma_1 = Rk

but how can we interpret the two Gaussian distribution in probability form?

 should it be like this (x is for state, and y is for observed value)?

 P(xt|y1, …, yt-1)*P(yt|xt) = P(xt, yt|y1, y2, …, yt-1) as N~(mu_0, sigma_0)

 and

 P(??|??) as N~(mu_1, sigma_1)

 so that after multiplication (correction step), we get P(xt|y1, y2, …, yt)?

 Especially the probability form of the observed distribution confuses me.

Looking forward to hearing from you. Happy new year!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1235#respond)↓ 
278.   ![Image 378](https://secure.gravatar.com/avatar/418f918002d4d8e182826fece680759334a31325f03dc9ef813e64a7112839ea?s=44&d=mm&r=g)**William Gao**[January 14, 2021 at 12:20 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1237)
Thanks! That’s easy-understanding and interesting.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1237#respond)↓ 
279.   ![Image 379](https://secure.gravatar.com/avatar/42fac58baa9e239a6dffea143ef9406365860ba4f21977afe1bdefe8050f4958?s=44&d=mm&r=g)**Mohammad Rahmani**[January 17, 2021 at 8:53 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1238)
I wish you had somethinf for particle filter too. Thanks anyway

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1238#respond)↓ 
280.   ![Image 380](https://secure.gravatar.com/avatar/8a45e6a61e4dadb5532ecce9a11c03d2e8896516853fd1411f95bbc4bb427feb?s=44&d=mm&r=g)**[Big Lebowsky](https://unpublished.com:8080/)**[March 6, 2021 at 2:40 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1241)
Thanks very good article actually helped me to finetune my python script to check K calculations in gravity.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1241#respond)↓ 
281.   ![Image 381](https://secure.gravatar.com/avatar/e136e441f88dab5aa0aa71c464f7d052e682a2e1b830c03d70523cd3059f08ae?s=44&d=mm&r=g)**Pedro Golmayo**[July 14, 2021 at 11:25 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1244)
Excellent. Thanks

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1244#respond)↓ 
282.   ![Image 382](https://secure.gravatar.com/avatar/451b858cfc71dea5d9725ab6abd2bd3c7dde2552facff384c82c50fab44f6389?s=44&d=mm&r=g)**Chen Chiyu**[August 7, 2021 at 8:39 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1245)
Pictures are so cute

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1245#respond)↓ 
283.   ![Image 383](https://secure.gravatar.com/avatar/451b858cfc71dea5d9725ab6abd2bd3c7dde2552facff384c82c50fab44f6389?s=44&d=mm&r=g)**Chiyu Chen**[August 8, 2021 at 6:54 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1247)
Your pictures are all exquisite ! It is so cute to explain how a Kalman Filter works.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1247#respond)↓ 
284.   ![Image 384](https://secure.gravatar.com/avatar/dbae6790060988a1f28410d20f82ee7bd69d4209cf45047c128e56319ca84ecd?s=44&d=mm&r=g)**Tan Phan**[August 11, 2021 at 12:10 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1248)
This is the best article that explains the topic interestingly.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1248#respond)↓ 
285.   ![Image 385](https://secure.gravatar.com/avatar/d0c7f22b362b51972690a026917c9ece05c4d519e6776f69700df84ff8dcbfb8?s=44&d=mm&r=g)**ravi**[August 29, 2021 at 4:31 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1250)
Excellent article for understanding of kalman filter.. Thank you for explaining it beautifully

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1250#respond)↓ 
286.   ![Image 386](https://secure.gravatar.com/avatar/b731f3ca2b5acd38dc9f8599cd77c607da0fe36bc73f7433373f6ac8e7dd5089?s=44&d=mm&r=g)**Amrit Sahu**[September 5, 2021 at 7:25 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1251)
One hell of an article. Awesome!!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1251#respond)↓ 
287.   ![Image 387](https://secure.gravatar.com/avatar/299779f1bcc6236e2924bba00ed35903bafe9503ec647068fc6e92486dd9ae0d?s=44&d=mm&r=g)**Fitwi**[November 3, 2021 at 9:30 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1254)
Thank you for this article. It explains a lot. Keep up the good work.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1254#respond)↓ 
288.   ![Image 388](https://secure.gravatar.com/avatar/6b51fbedbf719f1e2c7afb77cac8e5a1e785e574ee911394deae4bec6493f46a?s=44&d=mm&r=g)**mehmet rıza öz**[November 10, 2021 at 5:56 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1255)
Thank you for explaining all the cycle without any missing point.

 I could not understand them until reading your article.

 Great job!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1255#respond)↓ 
289.   ![Image 389](https://secure.gravatar.com/avatar/875d8aedc86ea6ce512ab457255d8928e0bcddc0a3e1a19d1bde03c7c07e3009?s=44&d=mm&r=g)**Viiresh Yang**[November 19, 2021 at 4:40 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1256)
Great job! I really get benefit from this article.

 Thank you!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1256#respond)↓ 
290.   ![Image 390](https://secure.gravatar.com/avatar/cc8208c757466110534b60083d6b719e22b0e094724c6dcee41d1f5fc94ee712?s=44&d=mm&r=g)**Alex Dowad**[February 13, 2022 at 8:20 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1259)
Thank you very, very much! I loved this article.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1259#respond)↓ 
291.   ![Image 391](https://secure.gravatar.com/avatar/9d0083284f098c8e9c6a5da5bded20ec6e6fd643200372a02abf07569e0e49dd?s=44&d=mm&r=g)**Stephen Kelly**[March 31, 2022 at 10:45 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1262)
The maths are classic probabilistic equations.

 Nature is 3D well 4 really accounting for realitivity.

 What about non probabilistic calculations to this model.

 Also acceleration is not equated into the model

 Bravo

 Great explanation

 Keep up the good writing on all things AI

 Enjoying

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1262#respond)↓ 
292.   ![Image 392](https://secure.gravatar.com/avatar/86043d8be3d4c2dcc1b046f4ef805dcedead1d91a11665a2180ee502bea6050d?s=44&d=mm&r=g)**Arijit Sinharay**[June 30, 2022 at 11:00 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1263)
Absolutely great – the best one ever..

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1263#respond)↓ 
293.   ![Image 393](https://secure.gravatar.com/avatar/126a4debca125492da5e2ada4d1c72a61b5d00ad8872a2f2799746728e930d70?s=44&d=mm&r=g)**Bill**[July 13, 2022 at 12:28 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1264)
Great article and I love the diagrams. I noticed in your ‘information flow’ diagram (and in others like it, e.g. on wikipedia.org), the input in time k, u(k), feeds x(k). I.e.

x(k) = Ax(k-1) + Bu(k)

In control engineering I was taught the following convention for defining u:

x(k) = Ax(k-1) + Bu(k-1) or x(k+1) = Ax(k) + Bu(k)

Is there a reason for using u(k) in your diagram and not u(k-1) or is it just a different convention?

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1264#respond)↓ 
294.   ![Image 394](https://secure.gravatar.com/avatar/889560aaf4d017c268edffda87a9a9f5e68a2d2943f1125000244cc1b26857fc?s=44&d=mm&r=g)**ja**[September 21, 2022 at 6:26 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1265)
Great article!

However, I would eliminate the vector notation of the position and velocity, and all references to wheel steering to clarify that the example only uses one dimension (a robot moving in a straight line where position measures distance to the origin and velocity measures the celerity along the line). Otherwise it is quite confusing.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1265#respond)↓ 
295.   ![Image 395](https://secure.gravatar.com/avatar/ba619929a59e619a009cbfecc3787946fd561f39da69dc2da4e1a7a4324874c1?s=44&d=mm&r=g)**[reklam ajansı](https://www.reklamajansin.com/)**[June 4, 2023 at 3:36 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1267)
Thank you for taking the time to share your experiences and expertise.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1267#respond)↓ 
296.   ![Image 396](https://secure.gravatar.com/avatar/eed5b16127ed62a760d2edee39c520349afe47528b60ef43b539ccb8cb57c381?s=44&d=mm&r=g)**Jeff**[October 26, 2023 at 1:17 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1271)
Awesome article, the visualization really made it easy to grasp the idea, really appreaciate it.

I’m trying to implement this and I need to be able to find the Q and R, which I discovered a method called ALS, I tried to read it up but I haven’t been able to grasp the idea. Would appreciate if you have any pointers or would be able to write a similar article like this one!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1271#respond)↓ 
297.   ![Image 397](https://secure.gravatar.com/avatar/ed96b52fc90cef00eedbd28bed1c0a7e8e41a2581b941634fe48811842f98602?s=44&d=mm&r=g)**Caiden**[December 31, 2023 at 5:19 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1272)
Great! Fantastic! I realize what it is! Thanks sooooooooo much!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1272#respond)↓ 
298.   ![Image 398](https://secure.gravatar.com/avatar/0addddacb4d42fdcb1e8664df039a3bc89257de5d63270ee592d7b59d8a38f59?s=44&d=mm&r=g)**Nasorenga**[May 29, 2024 at 10:42 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1278)
Best explanation of Kalman filter I have ever seen – thanks!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1278#respond)↓ 
299.   ![Image 399](https://secure.gravatar.com/avatar/2fba385f880d1d764e8af81d90094b3d79ecc9c53ecb02d8c9006f24104598fc?s=44&d=mm&r=g)**saumik**[June 19, 2024 at 1:26 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1279)
I have worked using others kalman code but not by understanding it. But now I got the intuition. Thanks brother.

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1279#respond)↓ 
300.   ![Image 400](https://secure.gravatar.com/avatar/d369019d38c19480384ea53ad0c0ca08e2971e7713ac4e7d0c883914f3959ced?s=44&d=mm&r=g)**A**[October 31, 2024 at 12:02 pm](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1282)
Extremely clear article. Thanks

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1282#respond)↓ 
301.   ![Image 401](https://secure.gravatar.com/avatar/9201fea1563abf7a7ba1ce35797f4284da85d53830336008f2f4b183d200606b?s=44&d=mm&r=g)**Dominik**[January 13, 2025 at 1:26 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1285)
Thanks for the article!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1285#respond)↓ 
302.   ![Image 402](https://secure.gravatar.com/avatar/754476559f3a263bee54f0dfdaf2d8043dbf22ce792d0c84ee86b833f5b3f7fd?s=44&d=mm&r=g)**[Michael Hsia](https://mikelhsia.github.io/)**[April 25, 2026 at 5:43 am](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1292)
Gotta give you this. This explanation is fabulous!

[Reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/?replytocom=1292#respond)↓ 

### Leave a Reply [Cancel reply](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#respond)

Your email address will not be published.Required fields are marked *

Comment *

Name *

Email *

Website

Search for: 

### Recent Posts

*   [Interview tips for moving up to leadership](https://www.bzarg.com/p/interview-tips-for-moving-up-to-leadership/)
*   [Some interesting napkin math about SpaceX’s passenger ICBM](https://www.bzarg.com/p/some-numbers-about-the-spacex-passenger-rocket/)
*   [What Bitcoin Shows Us About How Money Works](https://www.bzarg.com/p/what-bitcoin-shows-us-about-how-money-works/)
*   [12 trail runs under 10 miles in SF and the East Bay](https://www.bzarg.com/p/12-trail-runs-under-10-miles-in-sf-and-the-east-bay/)
*   [Infinitely Aged Christmas Pudding](https://www.bzarg.com/p/infinitely-aged-christmas-pudding/)

### Recent Comments

*   [Michael Hsia](https://mikelhsia.github.io/) on [How a Kalman filter works, in pictures](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1292)
*   Yong on [How a Kalman filter works, in pictures](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1291)
*   cgeorges on [How a Kalman filter works, in pictures](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1287)
*   Justin on [About](https://www.bzarg.com/about/#comment-1286)
*   Dominik on [How a Kalman filter works, in pictures](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/#comment-1285)

### Archives

*   [November 2019](https://www.bzarg.com/p/2019/11/)
*   [June 2018](https://www.bzarg.com/p/2018/06/)
*   [December 2017](https://www.bzarg.com/p/2017/12/)
*   [May 2016](https://www.bzarg.com/p/2016/05/)
*   [December 2015](https://www.bzarg.com/p/2015/12/)
*   [August 2015](https://www.bzarg.com/p/2015/08/)
*   [April 2015](https://www.bzarg.com/p/2015/04/)
*   [February 2015](https://www.bzarg.com/p/2015/02/)
*   [January 2015](https://www.bzarg.com/p/2015/01/)

### Categories

*   [Current Events](https://www.bzarg.com/p/category/current-events/)
*   [Drawings](https://www.bzarg.com/p/category/drawings/)
*   [Fiction](https://www.bzarg.com/p/category/fiction/)
*   [Mini-courses](https://www.bzarg.com/p/category/mini-courses/)
*   [Programming](https://www.bzarg.com/p/category/programming/)
*   [Uncategorized](https://www.bzarg.com/p/category/uncategorized/)

### Meta

*   [Log in](https://www.bzarg.com/wp-login.php)
*   [Entries feed](https://www.bzarg.com/feed/)
*   [Comments feed](https://www.bzarg.com/comments/feed/)
*   [WordPress.org](https://wordpress.org/)

[Proudly powered by WordPress](https://wordpress.org/ "Semantic Personal Publishing Platform")