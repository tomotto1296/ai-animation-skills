import subprocess,sys,re
v=sys.argv[1]
r=subprocess.run(["ffmpeg","-v","error","-i",v,"-vf","signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-","-f","null","-"],capture_output=True,text=True)
ys=[float(x) for x in re.findall(r"YAVG=([\d.]+)",r.stdout)]
d=[0]+[ys[i]-ys[i-1] for i in range(1,len(ys))]
print("frames",len(ys),"Ymin %.1f Ymax %.1f maxUp %.1f maxDown %.1f"%(min(ys),max(ys),max(d),min(d)))
big=[(i,round(x,1)) for i,x in enumerate(d) if abs(x)>=10]
print("|d|>=10 frames:",big)
for ts in [1.4,3.1,3.45,5.9,7.7]:
    i=int(round(ts*30)); print(ts,[round(y,1) for y in ys[i-1:i+8]])
