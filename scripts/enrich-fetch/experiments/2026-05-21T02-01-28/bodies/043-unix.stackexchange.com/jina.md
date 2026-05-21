# ubuntu - Memory runs full over time, high "buffer/cache" usage, low "available" memory - Unix & Linux Stack Exchange
[Skip to main content](https://unix.stackexchange.com/questions/415814/memory-runs-full-over-time-high-buffer-cache-usage-low-available-memory#content)

[](https://unix.stackexchange.com/questions/415814/memory-runs-full-over-time-high-buffer-cache-usage-low-available-memory#)[](https://unix.stackexchange.com/questions/415814/memory-runs-full-over-time-high-buffer-cache-usage-low-available-memory#)

#### Stack Exchange Network

Stack Exchange network consists of 183 Q&A communities including [Stack Overflow](https://stackoverflow.com/), the largest, most trusted online community for developers to learn, share their knowledge, and build their careers.

[Visit Stack Exchange](https://stackexchange.com/)

Loading…

1.   [](https://unix.stackexchange.com/help "Help Center and other resources")

    *   [Tour Start here for a quick overview of the site](https://unix.stackexchange.com/tour)
    *   [Help Center Detailed answers to any questions you might have](https://unix.stackexchange.com/help)
    *   [Meta Discuss the workings and policies of this site](https://unix.meta.stackexchange.com/)
    *   [About Us Learn more about Stack Overflow the company, and our products](https://stackoverflow.co/)

2.   [](https://stackexchange.com/ "A list of all 183 Stack Exchange sites")
3.   
### [current community](https://unix.stackexchange.com/)

   

    *   [Unix & Linux](https://unix.stackexchange.com/) [help](https://unix.stackexchange.com/help)[chat](https://chat.stackexchange.com/?tab=site&host=unix.stackexchange.com) 
    *    [Unix & Linux Meta](https://unix.meta.stackexchange.com/)

### your communities

[Sign up](https://unix.stackexchange.com/users/signup?ssrc=site_switcher&returnurl=https%3a%2f%2funix.stackexchange.com%2fquestions%2f415814%2fmemory-runs-full-over-time-high-buffer-cache-usage-low-available-memory) or [log in](https://unix.stackexchange.com/users/login?ssrc=site_switcher&returnurl=https%3a%2f%2funix.stackexchange.com%2fquestions%2f415814%2fmemory-runs-full-over-time-high-buffer-cache-usage-low-available-memory) to customize your list. 

### [more stack exchange communities](https://stackexchange.com/sites)

[company blog](https://stackoverflow.blog/)

5.   [Log in](https://unix.stackexchange.com/users/login?ssrc=head&returnurl=https%3a%2f%2funix.stackexchange.com%2fquestions%2f415814%2fmemory-runs-full-over-time-high-buffer-cache-usage-low-available-memory)
6.   [Sign up](https://unix.stackexchange.com/users/signup?ssrc=head&returnurl=https%3a%2f%2funix.stackexchange.com%2fquestions%2f415814%2fmemory-runs-full-over-time-high-buffer-cache-usage-low-available-memory)

[![Image 1: Unix & Linux](https://unix.stackexchange.com/Content/Sites/unix/Img/logo.svg?v=eb6eb2b9e73c)](https://unix.stackexchange.com/)

1.       1.   [Home](https://unix.stackexchange.com/)
    2.   [Questions](https://unix.stackexchange.com/questions)
    3.   [Unanswered](https://unix.stackexchange.com/unanswered)
    4.   [AI Assist](https://stackoverflow.com/ai-assist)
    5.   [Tags](https://unix.stackexchange.com/tags)

    7.   [Chat](https://chat.stackexchange.com/)
    8.   [Users](https://unix.stackexchange.com/users)

    10.   [Companies](https://stackoverflow.com/jobs/companies?so_medium=unix&so_source=SiteNav)

2.   Stack Internal Stack Overflow for Teams is now called **Stack Internal**. Bring the best of human thought and AI automation together at your work.

[Try for free](https://stackoverflowteams.com/teams/create/free/?utm_medium=referral&utm_source=unix-community&utm_campaign=side-bar&utm_content=explore-teams)[Learn more](https://stackoverflow.co/internal/?utm_medium=referral&utm_source=unix-community&utm_campaign=side-bar&utm_content=explore-teams) 
3.   [Stack Internal](javascript:void(0))
4.   Bring the best of human thought and AI automation together at your work. [Learn more](https://stackoverflow.co/internal/?utm_medium=referral&utm_source=unix-community&utm_campaign=side-bar&utm_content=explore-teams-compact)

**Stack Internal**

Knowledge at work

Bring the best of human thought and AI automation together at your work.

[Explore Stack Internal](https://stackoverflow.co/internal/?utm_medium=referral&utm_source=unix-community&utm_campaign=side-bar&utm_content=explore-teams-compact-popover)

# [Memory runs full over time, high "buffer/cache" usage, low "available" memory](https://unix.stackexchange.com/questions/415814/memory-runs-full-over-time-high-buffer-cache-usage-low-available-memory)

[Ask Question](https://unix.stackexchange.com/questions/ask)

Asked 8 years, 4 months ago

Modified[2 years, 4 months ago](https://unix.stackexchange.com/questions/415814/memory-runs-full-over-time-high-buffer-cache-usage-low-available-memory?lastactivity "2024-01-15 12:00:50Z")

Viewed 143k times 

 31 

[](https://unix.stackexchange.com/posts/415814/timeline "Show activity on this post.")

Whenever I reboot my laptop, everything runs amazingly and I have a maximum of 40% memory usage (out of 8GB). However over time (~ 1 day of usage), memory usage goes up to 90%+, and the system starts swapping.

Right now, `free -mh` returns this:

```
total        used        free      shared  buff/cache   available
Mem:           7,7G        1,3G        141M        223M        6,3G        246M
Swap:          7,5G        530M        6,9G
```

I was assuming that buff/cache memory is free to be reallocated if processes require it, but it seems to mostly be unavailable.

`cat /proc/meminfo`:

```
MemTotal:        8055268 kB
MemFree:          145184 kB
MemAvailable:     247984 kB
Buffers:           49092 kB
Cached:           423724 kB
SwapCached:        38652 kB
Active:           881184 kB
Inactive:         791552 kB
Active(anon):     708420 kB
Inactive(anon):   725564 kB
Active(file):     172764 kB
Inactive(file):    65988 kB
Unevictable:         252 kB
Mlocked:             252 kB
SwapTotal:       7812092 kB
SwapFree:        7267624 kB
Dirty:               352 kB
Writeback:             0 kB
AnonPages:       1195320 kB
Mapped:           235860 kB
Shmem:            234068 kB
Slab:            6117796 kB
SReclaimable:     167260 kB
SUnreclaim:      5950536 kB
KernelStack:       10352 kB
PageTables:        30312 kB
NFS_Unstable:          0 kB
Bounce:                0 kB
WritebackTmp:          0 kB
CommitLimit:    11839724 kB
Committed_AS:    6410728 kB
VmallocTotal:   34359738367 kB
VmallocUsed:           0 kB
VmallocChunk:          0 kB
HardwareCorrupted:     0 kB
AnonHugePages:    104448 kB
CmaTotal:              0 kB
CmaFree:               0 kB
HugePages_Total:       0
HugePages_Free:        0
HugePages_Rsvd:        0
HugePages_Surp:        0
Hugepagesize:       2048 kB
DirectMap4k:     1361472 kB
DirectMap2M:     5859328 kB
DirectMap1G:     1048576 kB
```

I found these values especially interesting, as they correlate a lot with the buff/cache usage from `free`, but I don't know what to do with them or where to look next:

```
SReclaimable:     167260 kB
SUnreclaim:      5950536 kB
Slab:            6117796 kB
```

Where can I look next? What is the slab, and is there a way to reduce it's memory usage?

*   [ubuntu](https://unix.stackexchange.com/questions/tagged/ubuntu "show questions tagged 'ubuntu'")
*   [memory](https://unix.stackexchange.com/questions/tagged/memory "show questions tagged 'memory'")
*   [out-of-memory](https://unix.stackexchange.com/questions/tagged/out-of-memory "show questions tagged 'out-of-memory'")

[Share](https://unix.stackexchange.com/q/415814 "Short permalink to this question")

[Improve this question](https://unix.stackexchange.com/posts/415814/edit)

 Follow 

 asked Jan 9, 2018 at 12:54

[![Image 2: Max Hollmann's user avatar](https://i.sstatic.net/YGEVg.jpg?s=64)](https://unix.stackexchange.com/users/269614/max-hollmann)

[Max Hollmann](https://unix.stackexchange.com/users/269614/max-hollmann)

441 1 1 gold badge 4 4 silver badges 6 6 bronze badges

4

*     But what is your real problem? The system works as expected, nothing to fear from these numbers. And if you dislike the swapping you can run your system without swap at all. Otherwise see if you are a long running process that hogs the RAM. On my systems it is often the browser...Patrick Mevzek  –[Patrick Mevzek](https://unix.stackexchange.com/users/211833/patrick-mevzek "3,270 reputation") 2018-01-09 14:26:07 +00:00 Commented Jan 9, 2018 at 14:26  
*   1  It gets sluggish, because of swapping. But the memory genuinely seems to be used, so swap is necessary. Swappiness is already pretty low (10). None of my processes seem to take up a lot of memory. The most is used by firefox, and that's less than 1GB. Even when I close most processes, most of the RAM is still unavailable.Max Hollmann  –[Max Hollmann](https://unix.stackexchange.com/users/269614/max-hollmann "441 reputation") 2018-01-09 15:56:16 +00:00 Commented Jan 9, 2018 at 15:56  
*     Remove the swap then. In `top` hit `M` and processes will be ordered by amount of RAM they use. RAM is not unavailable. Cache/Buffer part will shrink automatically as needed. And as counter-intuitive as it may be the kernel may decide it is better to put things in swap (pages rarely touched, like a sleeping process) than take memory from the buffer cache.Patrick Mevzek  –[Patrick Mevzek](https://unix.stackexchange.com/users/211833/patrick-mevzek "3,270 reputation") 2018-01-09 16:24:33 +00:00 Commented Jan 9, 2018 at 16:24  
*   3  @PatrickMevzek, 6GB of unreclaimable slab memory when the active processes use only 1.6 GB sounds like an issue to me because the Kernel is not freeing the memory to be used by the processes, so the system becomes sluggish and needs a reboot.Alecz  –[Alecz](https://unix.stackexchange.com/users/36931/alecz "141 reputation") 2019-11-18 14:59:56 +00:00 Commented Nov 18, 2019 at 14:59  

[Add a comment](https://unix.stackexchange.com/questions/415814/memory-runs-full-over-time-high-buffer-cache-usage-low-available-memory# "Use comments to ask for more information or suggest improvements. Avoid answering questions in comments.")|[](https://unix.stackexchange.com/questions/415814/memory-runs-full-over-time-high-buffer-cache-usage-low-available-memory# "Expand to show all comments on this post")

[](https://unix.stackexchange.com/questions/415814/memory-runs-full-over-time-high-buffer-cache-usage-low-available-memory)

## 3 Answers 3

 Sorted by:  [Reset to default](https://unix.stackexchange.com/questions/415814/memory-runs-full-over-time-high-buffer-cache-usage-low-available-memory?answertab=scoredesc#tab-top)

[](https://unix.stackexchange.com/questions/415814/memory-runs-full-over-time-high-buffer-cache-usage-low-available-memory)

 25 

[](https://unix.stackexchange.com/posts/415817/timeline "Show activity on this post.")

You should check with `top` if something is actually using your RAM or not, sort by memory usage, or check the memory usage in the System Monitor.

Linux will borrow unused memory for disk caching. This makes it looks like you are low on memory, but you are not. Check this webpage for more explanation : [https://www.linuxatemyram.com/](https://www.linuxatemyram.com/)

You have actually around 6.5Gb unused memory on the example which was posted. You can also see that the swap amount is very low (540Mb).

You can release the cache(s) as [explained here](https://unix.stackexchange.com/questions/87908/how-do-you-empty-the-buffers-and-cache-on-a-linux-system) and then `free` will display you the free memory in the available field :

*   To free pagecache:

```
# echo 1 > /proc/sys/vm/drop_caches
```
*   To free dentries and inodes:

```
# echo 2 > /proc/sys/vm/drop_caches
```
*   To free pagecache, dentries and inodes:

```
# echo 3 > /proc/sys/vm/drop_caches
```

Or with this command :

```
free && sync && echo 3 > /proc/sys/vm/drop_caches && free
```

Regarding Slab:

 Slab, SReclaimable, SUnreclaim

 The kernel does a lot of repetition during the time it is running. Some objects, like asking for the specific inode of a file may be performed thousand times a day. In such case, it would be wise to store it in a quick reference list, or cache. Slab are the caches for kernel objects, to optimize those activities that happen the most.

The Slab field is the total of SReclaimable and SUnreclaim.

Try to troubleshoot what is using the Slab SUnreclaim memory amount with `slabtop`.

The above are meant to be run as root.

[Share](https://unix.stackexchange.com/a/415817 "Short permalink to this answer")

[Improve this answer](https://unix.stackexchange.com/posts/415817/edit)

 Follow 

[edited Jun 11, 2020 at 14:16](https://unix.stackexchange.com/posts/415817/revisions "show all edits to this post")

[![Image 3: Community's user avatar](https://www.gravatar.com/avatar/a007be5a61f6aa8f3e85ae2fc18dd66e?s=64&d=identicon&r=PG)](https://unix.stackexchange.com/users/-1/community)

[Community](https://unix.stackexchange.com/users/-1/community)Bot

1

 answered Jan 9, 2018 at 13:05

[![Image 4: magor's user avatar](https://www.gravatar.com/avatar/f3406a09cd6a7dfce9d54794fa3b7537?s=64&d=identicon&r=PG&f=y&so-version=2)](https://unix.stackexchange.com/users/137578/magor)

[magor](https://unix.stackexchange.com/users/137578/magor)

3,932 3 3 gold badges 17 17 silver badges 30 30 bronze badges

8

*   6  Just to be clear: freeing the various caches is counterproductive. It will "improve" the numbers and perhaps make the OP feel better for a little while, but the caches will be repopulated with time and everything will go back to the way it was before the caches were freed: that is _normal_. Unless there is some other indication that something is wrong, it is best to leave this alone.NickD  –[NickD](https://unix.stackexchange.com/users/230615/nickd "3,038 reputation") 2018-01-09 13:31:15 +00:00 Commented Jan 9, 2018 at 13:31  
*   1  Additionally the provided `meminfo` shows that the memory is sitting in slab unreclaimable, so this won't do anything anyway.phemmer  –[phemmer](https://unix.stackexchange.com/users/4358/phemmer "74,201 reputation") 2018-01-09 13:54:01 +00:00 Commented Jan 9, 2018 at 13:54  
*     I've tried that, it releases at most a couple of MB. Like Patrick says, it seems to be the slab, and I have no idea what that is or how to troubleshoot it.Max Hollmann  –[Max Hollmann](https://unix.stackexchange.com/users/269614/max-hollmann "441 reputation") 2018-01-09 16:01:12 +00:00 Commented Jan 9, 2018 at 16:01  
*   2  @mazs: OK - I see now that the OP is complaining about swapping and sluggishness (although he does not seem to be using much swap). But the unreclaimable memory in the slab does seem problematic.NickD  –[NickD](https://unix.stackexchange.com/users/230615/nickd "3,038 reputation") 2018-01-10 12:48:14 +00:00 Commented Jan 10, 2018 at 12:48  
*   7  @mazs - in the link you provided (+1 for the great link), it says "To see how much ram your applications could use without swapping, run free -m and look at the "available" column. Now the OP has only 246M in the available column - But you mentioned in your answer that there is actually 6.5GB. Seems like there is a contradiction ?HopeKing  –[HopeKing](https://unix.stackexchange.com/users/246014/hopeking "101 reputation") 2018-07-04 08:58:58 +00:00 Commented Jul 4, 2018 at 8:58  

[](https://unix.stackexchange.com/questions/415814/memory-runs-full-over-time-high-buffer-cache-usage-low-available-memory# "Use comments to ask for more information or suggest improvements. Avoid comments like “+1” or “thanks”.")|[Show **3** more comments](https://unix.stackexchange.com/questions/415814/memory-runs-full-over-time-high-buffer-cache-usage-low-available-memory# "Expand to show all comments on this post")

[](https://unix.stackexchange.com/questions/415814/memory-runs-full-over-time-high-buffer-cache-usage-low-available-memory)

 3 

[](https://unix.stackexchange.com/posts/456688/timeline "Show activity on this post.")

So after some somewhat overengineered [troubleshooting](https://github.com/maxhollmann/slab-profiler) I found out that [xflux](https://justgetflux.com/) seems to be causing the `kmalloc-4096` slab to grow slowly but steadily. I will try to find out why and update this anwser.

[Share](https://unix.stackexchange.com/a/456688 "Short permalink to this answer")

[Improve this answer](https://unix.stackexchange.com/posts/456688/edit)

 Follow 

 answered Jul 17, 2018 at 6:42

[![Image 5: Max Hollmann's user avatar](https://i.sstatic.net/YGEVg.jpg?s=64)](https://unix.stackexchange.com/users/269614/max-hollmann)

[Max Hollmann](https://unix.stackexchange.com/users/269614/max-hollmann)

441 1 1 gold badge 4 4 silver badges 6 6 bronze badges

[Add a comment](https://unix.stackexchange.com/questions/415814/memory-runs-full-over-time-high-buffer-cache-usage-low-available-memory# "Use comments to ask for more information or suggest improvements. Avoid comments like “+1” or “thanks”.")|[](https://unix.stackexchange.com/questions/415814/memory-runs-full-over-time-high-buffer-cache-usage-low-available-memory# "Expand to show all comments on this post")

[](https://unix.stackexchange.com/questions/415814/memory-runs-full-over-time-high-buffer-cache-usage-low-available-memory)

 0 

[](https://unix.stackexchange.com/posts/766960/timeline "Show activity on this post.")

As a side note, I recently faced on a system running `top` in batch mode (-b option) that the proc SLAB grows. For example:

```
# cat /proc/slabinfo | grep proc
proc_inode_cache    5567   5868    440    9    1 : tunables    0    0    0 : slabdata    652    652      0
```

When I start my system without top running, the proc SLAB memory consumption is tremendously lower:

```
# cat /proc/slabinfo | grep proc
proc_inode_cache     564    846    440    9    1 : tunables    0    0    0 : slabdata     94     94      0
```

This is due to the fact that `top` tool travels all over /proc to get the per-process statistics. This triggers the filling of the proc SLAB with the inodes of the last accessed proc files.

[Share](https://unix.stackexchange.com/a/766960 "Short permalink to this answer")

[Improve this answer](https://unix.stackexchange.com/posts/766960/edit)

 Follow 

 answered Jan 15, 2024 at 12:00

[![Image 6: RKou's user avatar](https://i.sstatic.net/Ql36a.png?s=64)](https://unix.stackexchange.com/users/435859/rkou)

[RKou](https://unix.stackexchange.com/users/435859/rkou)

172 1 1 silver badge 7 7 bronze badges

[Add a comment](https://unix.stackexchange.com/questions/415814/memory-runs-full-over-time-high-buffer-cache-usage-low-available-memory# "Use comments to ask for more information or suggest improvements. Avoid comments like “+1” or “thanks”.")|[](https://unix.stackexchange.com/questions/415814/memory-runs-full-over-time-high-buffer-cache-usage-low-available-memory# "Expand to show all comments on this post")

## You must [log in](https://unix.stackexchange.com/users/login?ssrc=question_page&returnurl=https%3a%2f%2funix.stackexchange.com%2fquestions%2f415814) to answer this question.

Start asking to get answers

Find the answer to your question by asking.

[Ask question](https://unix.stackexchange.com/questions/ask)

Explore related questions

*   [ubuntu](https://unix.stackexchange.com/questions/tagged/ubuntu "show questions tagged 'ubuntu'")
*   [memory](https://unix.stackexchange.com/questions/tagged/memory "show questions tagged 'memory'")
*   [out-of-memory](https://unix.stackexchange.com/questions/tagged/out-of-memory "show questions tagged 'out-of-memory'")

See similar questions with these tags.

*    The Overflow Blog 
*    [Your fridge could be a threat to national security](https://stackoverflow.blog/2026/05/19/your-fridge-could-be-a-threat-to-national-security/) 
*    [Pack your agentic stack in Slack](https://stackoverflow.blog/2026/05/20/pack-your-agentic-stack-in-slack/) 
*    Featured on Meta 
*     [(Almost) One year of Challenges](https://meta.stackexchange.com/questions/418261/almost-one-year-of-challenges) 

### Linked

[419](https://unix.stackexchange.com/questions/87908/how-do-you-empty-the-buffers-and-cache-on-a-linux-system "Question score (upvotes - downvotes)")[How do you empty the buffers and cache on a Linux system?](https://unix.stackexchange.com/questions/87908/how-do-you-empty-the-buffers-and-cache-on-a-linux-system?noredirect=1)

### Related

[13](https://unix.stackexchange.com/questions/56879/tracking-down-missing-memory-usage-in-linux "Question score (upvotes - downvotes)")[Tracking down "missing" memory usage in linux](https://unix.stackexchange.com/questions/56879/tracking-down-missing-memory-usage-in-linux)

[10](https://unix.stackexchange.com/questions/62066/what-is-kernel-dynamic-memory-as-reported-by-smem "Question score (upvotes - downvotes)")[What is "kernel dynamic memory" as reported by smem?](https://unix.stackexchange.com/questions/62066/what-is-kernel-dynamic-memory-as-reported-by-smem)

[0](https://unix.stackexchange.com/questions/128172/buffer-cache-and-free-memory "Question score (upvotes - downvotes)")[buffer cache and free memory](https://unix.stackexchange.com/questions/128172/buffer-cache-and-free-memory)

[12](https://unix.stackexchange.com/questions/237545/is-unreclaimable-memory-allocated-to-slab-considered-used-or-available-cache "Question score (upvotes - downvotes)")[Is unreclaimable memory allocated to slab considered used or available cache?](https://unix.stackexchange.com/questions/237545/is-unreclaimable-memory-allocated-to-slab-considered-used-or-available-cache)

[2](https://unix.stackexchange.com/questions/638906/ram-free-decreases-over-time-due-to-increasing-ram-cache-buffer "Question score (upvotes - downvotes)")[RAM Free decreases over time due to increasing RAM Cache + Buffer](https://unix.stackexchange.com/questions/638906/ram-free-decreases-over-time-due-to-increasing-ram-cache-buffer)

[2](https://unix.stackexchange.com/questions/717838/linux-server-high-memory-usage-without-applications "Question score (upvotes - downvotes)")[Linux server high memory usage without applications](https://unix.stackexchange.com/questions/717838/linux-server-high-memory-usage-without-applications)

#### [Hot Network Questions](https://stackexchange.com/questions?tab=hot)

*    [Reducing a DC voltage](https://electronics.stackexchange.com/questions/769070/reducing-a-dc-voltage)
*    [What screws should I use to mount a ceiling fan bracket to this box?](https://diy.stackexchange.com/questions/330605/what-screws-should-i-use-to-mount-a-ceiling-fan-bracket-to-this-box)
*    [expanding an argument to control case in \href](https://tex.stackexchange.com/questions/762966/expanding-an-argument-to-control-case-in-href)
*    [Single arm Bicep Curls & Hammer Curls - avoiding back strain while doing Train to Failure](https://fitness.stackexchange.com/questions/48865/single-arm-bicep-curls-hammer-curls-avoiding-back-strain-while-doing-train-t)
*    [Increase DC-coupled signal by a factor of 2 with common components](https://electronics.stackexchange.com/questions/769060/increase-dc-coupled-signal-by-a-factor-of-2-with-common-components)
*    [Reconcile two seemingly conflicting passages: Isaiah 42:2 & John 7:37-38](https://hermeneutics.stackexchange.com/questions/116498/reconcile-two-seemingly-conflicting-passages-isaiah-422-john-737-38)
*    [Understanding a gcd estimate in Iwaniec–Sarnak (1999)](https://mathoverflow.net/questions/511405/understanding-a-gcd-estimate-in-iwaniec-sarnak-1999)
*    [How can I privately insure against bank going bankrupt?](https://money.stackexchange.com/questions/169603/how-can-i-privately-insure-against-bank-going-bankrupt)
*    [Setting a file descriptor as close-on-exec in bash](https://unix.stackexchange.com/questions/806048/setting-a-file-descriptor-as-close-on-exec-in-bash)
*    [Prepend a block of lines to the start of each non-empty line](https://vi.stackexchange.com/questions/48664/prepend-a-block-of-lines-to-the-start-of-each-non-empty-line)
*    [Why was Retribution such an issue when Harmony exists?](https://scifi.stackexchange.com/questions/304522/why-was-retribution-such-an-issue-when-harmony-exists)
*    [Launchpad PPA: restore superseded package version (help!)](https://askubuntu.com/questions/1567006/launchpad-ppa-restore-superseded-package-version-help)
*    [Musical doggerel?](https://music.stackexchange.com/questions/143698/musical-doggerel)
*    [Polynomial Pest Control](https://puzzling.stackexchange.com/questions/138139/polynomial-pest-control)
*    [Book introducing international law?](https://law.stackexchange.com/questions/114785/book-introducing-international-law)
*    [How is the miller plateau related to miller effect?](https://electronics.stackexchange.com/questions/769143/how-is-the-miller-plateau-related-to-miller-effect)
*    [Why Did David Wear an Ephod? (2 Samuel 6)](https://hermeneutics.stackexchange.com/questions/116493/why-did-david-wear-an-ephod-2-samuel-6)
*    [How does the p region of a thyristor become an n region during gate triggering?](https://physics.stackexchange.com/questions/872510/how-does-the-p-region-of-a-thyristor-become-an-n-region-during-gate-triggering)
*    [Full-color fantasy-style visual picture puzzle book where a prince's lever pull on a gear-and-pulley machine decides a princess's fate](https://scifi.stackexchange.com/questions/304529/full-color-fantasy-style-visual-picture-puzzle-book-where-a-princes-lever-pull)
*    [How easy/safe is it to lower the nut on a classical guitar?](https://music.stackexchange.com/questions/143696/how-easy-safe-is-it-to-lower-the-nut-on-a-classical-guitar)
*    [is it possible to use multiple input streams through ssh?](https://unix.stackexchange.com/questions/806075/is-it-possible-to-use-multiple-input-streams-through-ssh)
*    [C# Style Switch Expressions in C++](https://stackoverflow.com/questions/79943166/c-sharp-style-switch-expressions-in-c)
*    [What's the difference between a well-orderable set and a well-ordered set](https://math.stackexchange.com/questions/5137421/whats-the-difference-between-a-well-orderable-set-and-a-well-ordered-set)
*    [Is there a name for the diluting effect in votations when multiple options are close together in preference?](https://stats.stackexchange.com/questions/676016/is-there-a-name-for-the-diluting-effect-in-votations-when-multiple-options-are-c)

[more hot questions](https://unix.stackexchange.com/questions/415814/memory-runs-full-over-time-high-buffer-cache-usage-low-available-memory#)

[Question feed](https://unix.stackexchange.com/feeds/question/415814 "Feed of this question and its answers")

# Subscribe to RSS

 Question feed 
To subscribe to this RSS feed, copy and paste this URL into your RSS reader.

 

[](https://unix.stackexchange.com/questions/415814/memory-runs-full-over-time-high-buffer-cache-usage-low-available-memory#)

##### [Unix & Linux](https://unix.stackexchange.com/)

*   [Tour](https://unix.stackexchange.com/tour)
*   [Help](https://unix.stackexchange.com/help)
*   [Chat](https://chat.stackexchange.com/?tab=site&host=unix.stackexchange.com)
*   [Contact](https://unix.stackexchange.com/contact)
*   [Feedback](https://unix.meta.stackexchange.com/)

##### [Company](https://stackoverflow.co/)

*   [Stack Overflow](https://stackoverflow.com/)
*   [Stack Internal](https://stackoverflow.co/internal/)
*   [Stack Data Licensing](https://stackoverflow.co/data-licensing/)
*   [Stack Ads](https://stackoverflow.co/advertising/)
*   [About](https://stackoverflow.co/)
*   [Press](https://stackoverflow.co/company/press/)
*   [Legal](https://stackoverflow.com/legal)
*   [Privacy Policy](https://stackoverflow.com/legal/privacy-policy)
*   [Terms of Service](https://stackoverflow.com/legal/terms-of-service/public)
*    Your Privacy Choices 
*   [Cookie Policy](https://policies.stackoverflow.co/stack-overflow/cookie-policy)

##### [Stack Exchange Network](https://stackexchange.com/)

*   [Technology](https://stackexchange.com/sites#technology)
*   [Culture & recreation](https://stackexchange.com/sites#culturerecreation)
*   [Life & arts](https://stackexchange.com/sites#lifearts)
*   [Science](https://stackexchange.com/sites#science)
*   [Professional](https://stackexchange.com/sites#professional)
*   [Business](https://stackexchange.com/sites#business)
*   [API](https://api.stackexchange.com/)
*   [Data](https://data.stackexchange.com/)

*   [Blog](https://stackoverflow.blog/?blb=1)
*   [Facebook](https://www.facebook.com/officialstackoverflow/)
*   [Twitter](https://twitter.com/stackoverflow)
*   [LinkedIn](https://linkedin.com/company/stack-overflow)
*   [Instagram](https://www.instagram.com/thestackoverflow)

Site design / logo © 2026 Stack Exchange Inc; user contributions licensed under [CC BY-SA](https://stackoverflow.com/help/licensing). rev 2026.5.18.43150

 Linux is a registered trademark of Linus Torvalds. UNIX is a registered trademark of The Open Group. 

This site is not affiliated with Linus Torvalds or The Open Group in any way. 

By continuing to use this website, you agree Stack Exchange can store cookies on your device and disclose information in accordance with our [Cookie Policy](https://policies.stackoverflow.co/stack-overflow/cookie-policy/). By exiting this window, default cookies will be accepted. To reject cookies, select an option from below.

Necessary cookies only

Customize settings

![Image 8: Stack Exchange Inc.](https://cdn.cookielaw.org/logos/static/ot_company_logo.png)

## Cookie consent preference center

When you visit any of our websites, it may store or retrieve information on your browser, mostly in the form of cookies. This information might be about you, your preferences, or your device and is mostly used to make the site work as you expect it to. The information does not usually directly identify you, but it can give you a more personalized experience. Because we respect your right to privacy, you can choose not to allow some types of cookies. Click on the different category headings to find out more and manage your preferences. Please note, blocking some types of cookies may impact your experience of the site and the services we are able to offer. 

[Cookie policy](https://policies.stackoverflow.co/stack-overflow/cookie-policy/)

Accept all cookies
### Manage consent preferences

#### Strictly Necessary Cookies

Always Active

These cookies are necessary for the website to function and cannot be switched off in our systems. They are usually only set in response to actions made by you which amount to a request for services, such as setting your privacy preferences, logging in or filling in forms. You can set your browser to block or alert you about these cookies, but some parts of the site will not then work. These cookies do not store any personally identifiable information.

#### Targeting Cookies

- [x] Targeting Cookies 

These cookies are used to make advertising messages more relevant to you and may be set through our site by us or by our advertising partners. They may be used to build a profile of your interests and show you relevant advertising on our site or on other sites. They do not store directly personal information, but are based on uniquely identifying your browser and internet device.

#### Performance Cookies

- [x] Performance Cookies 

These cookies allow us to count visits and traffic sources so we can measure and improve the performance of our site. They help us to know which pages are the most and least popular and see how visitors move around the site. All information these cookies collect is aggregated and therefore anonymous. If you do not allow these cookies we will not know when you have visited our site, and will not be able to monitor its performance.

#### Functional Cookies

- [x] Functional Cookies 

These cookies enable the website to provide enhanced functionality and personalisation. They may be set by us or by third party providers whose services we have added to our pages. If you do not allow these cookies then some or all of these services may not function properly.

### Cookie List

Clear

*   - [x] checkbox label label 

Apply Cancel

Consent Leg.Interest

- [x] checkbox label label

- [x] checkbox label label

- [x] checkbox label label

Necessary cookies only Confirm my choices

[![Image 9: Powered by Onetrust](https://cdn.cookielaw.org/logos/static/powered_by_logo.svg)](https://www.onetrust.com/solutions/consent-and-preferences/?utm_source=cmp&utm_medium=cmpbanner)