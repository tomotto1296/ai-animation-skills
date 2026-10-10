import subprocess,sys,re
v=sys.argv[1]
r=subprocess.run(["ffmpeg","-v","error","-i",v,"-vf","signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-,metadata=print:key=lavfi.signalstats.YLOW:file=-","-f","null","-"],capture_output=True,text=True)
ys=[float(x) for x in re.findall(r"YAVG=([\d.]+)",r.stdout)]
yl=[float(x) for x in re.findall(r"YLOW=([\d.]+)",r.stdout)]
yh=[]
d=[0]+[ys[i]-ys[i-1] for i in range(1,len(ys))]
print("frames",len(ys),"YAVG min %.1f max %.1f | max|d| %.1f | YLOW max %.0f (白判定は>=220)"%(min(ys),max(ys),max(abs(x) for x in d),max(yl) if yl else -1))
print("|d|>=6 frames:",[(i,round(x,1)) for i,x in enumerate(d) if abs(x)>=6][:20])
print("YAVG per sec:",[round(ys[min(len(ys)-1,s*30)],0) for s in range(0,10)])
