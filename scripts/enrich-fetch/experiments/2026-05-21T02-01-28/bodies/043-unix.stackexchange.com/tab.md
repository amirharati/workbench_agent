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