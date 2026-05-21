Share on social:

When you hear cricket like high pitched irritating noises coming from your graphics card (GPU), less often from power regulation modules (VRM) of motherboards and power supplies (PSUs), that is coil whine.

This happens in almost all electrical devices, usually at a frequency and volume that’s inaudible to humans, especially inside a case. In some cases, you can hear the pitch of the coil whine change as the GPU draws more or less power, especially often at very high framerate situations.

We already mentioned chokes, aka inductor coils when we were first discussing MOSFETs and power delivery systems of motherboards in one of our earlier blog posts “[What are MOSFETs and why you should keep them cool?](https://www.ekwb.com/blog/what-is-mosfet-and-why-should-you-keep-it-cool/)“. So, you should be able to identify them quite easily, but let’s break them down a bit, literally, for a better understanding of them.

![](https://www.ekwb.com/wp-content/uploads/2018/12/Coil_whine_Cricket.jpg)

A choke is an inductor designed specifically for blocking high-frequency alternating current (AC) in an electrical circuit while allowing direct current (DC) or low-frequency signals to pass. In the case of modern hardware applications (GPUs and motherboards), they are usually housed in little boxes (far left), and they consist of a thick copper wire coiled around a ferrite core. Older motherboards used bigger open style inductors (far right), and these types are still prominent in power supplies.

## How does coil whine occur?

As power runs through the coil it vibrates and causes the noise we all find irritating. This is sometimes the case of bad soldering of an inductor coil, but it is not always the issue. Most usual suspects are core and input filter coils due to the fact that most of the current flows through them. Coils in the memory voltage regulation and minor rails are rarely under enough load to cause any coil whine.

### FPS correlation

Oftentimes you can hear the worst coil whine in games at loading screens, or in between scenes unless the game menu screen is limited to 30 frames per second or less often to 60 frames per second. The reason for that is that during the loading screens or game menus, the output of frames per second goes through the roof, meaning more GPU usage. This makes the changes in GPU power consumption are more frequent causing more stress on the coils, thus more vibrations. During every frame, you have operations that are being done and, of course, power spikes depending on the operation that was done. When you have more FPS, the power spikes are more frequent causing higher noise.

If you’ve even run [Unigine™ Heaven](https://benchmark.unigine.com/heaven) benchmarks while owning a GPU with coil whine, on the end credits after you close it, the FPS count goes so high that noise from the coils also increases exponentially.

## How do we combat coil whine?

There is an urban legend that running the new GPU under high stress for 24h or so can reduce coil whine, but it was never scientifically proven. Basically, the only way to fight it, once you have it, is dampening or moving the case away. The nature of high-frequency noise is that it quickly becomes inaudible over distance, so moving the case by half a meter or more, can often make it inaudible. Also having a closed case, or a case with sound insulation can greatly help vs high-frequency noise.

![coil whine inductor graphics card](https://www.ekwb.com/wp-content/uploads/2018/12/coil_gpu.jpg)

### Coil whine and water blocks

Putting thermal pads over the inductor coils and pressing them down via water block could potentially lessen the vibration which is why EK includes thermal pads with their EK Vector series water blocks which are to be applied to inductor coils of NVIDIA® RTX® cards. Unfortunately, when removing stock air coolers from GPUs users are also removing the sources of noise pollution and in these cases, GPU cards with more prominent coil whines become even more annoying.

We hope we’ve explained why the coil whine happens and how you can try fighting it.

### Learn more about EK products

#### Visit EK Shop

Browse our high performance Quantum, Lignum and Classic product lines, Kits and Accessories.

#### Fluid Gaming Prebuilt PCs

Not the DIY person? Check out our fully water-cooled prebuilt PCs.