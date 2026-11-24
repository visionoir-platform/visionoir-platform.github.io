from PIL import Image,ImageDraw
from math import sin,cos,pi
from characters import INK,DARK,SHADOW,STEEL,SILVER,WHITE

TYPES=['ring','secret','portal','shield','spring','checkpoint','breakable','terminal','battery','spike','core','exit','block','crawler','drone','turret','wisp','sentry','eel','pulse','shard','beam','mine','disc','friendly','spark','shock','rain','smoke','drift','debris','transform','telekinesis','splash','fire','boost','collect','larpking']
def object_art(kind,f):
    im=Image.new('RGBA',(40,40));d=ImageDraw.Draw(im);t=f*pi/3;dy=round(sin(t)*2)
    s=STEEL;m=SILVER;w=WHITE;a='#8de6d4'; hot='#ff997b'
    def p(points,fill,edge=INK):d.polygon(points,fill=fill,outline=edge)
    def l(ps,c,width=1):d.line(ps,fill=c,width=width)
    def rect(box,fill,edge=INK):d.rectangle(box,fill,outline=edge)
    def oval(box,fill,edge=INK):d.ellipse(box,fill,outline=edge)
    if kind in ('ring','secret','core'):
        wid=max(2,round(7*abs(cos(t))));y=19+dy
        if kind=='ring':
            d.ellipse((20-wid,y-7,20+wid,y+7),outline='#775948',width=3)
            d.arc((20-wid,y-7,20+wid,y+6),130,308,fill='#ffdc99',width=2)
            d.point((20+wid-1,y+2),fill=w)
        elif kind=='secret':
            p([(20,y-8),(20+wid,y),(20,y+9),(20-wid,y)],'#b69be6')
            l([(20,y-6),(20-2,y),(20,y+5)],w)
        else:
            p([(19,y-11),(27,y-6),(26,y+6),(21,y+10),(13,y+6),(12,y-5)],s)
            p([(20,y-7),(24,y-3),(21,y+7),(16,y+2)],a)
    elif kind in ('portal','exit'):
        c=a if kind=='portal' else '#ffd788'
        for j in (-1,1):
            p([(20+j*12,35),(20+j*14,31),(20+j*12,12),(20+j*5,5),(20+j*3,8),(20+j*8,14),(20+j*8,32)],s)
            l([(20+j*10,30),(20+j*10,14),(20+j*5,8)],c)
        d.arc((10,9,29,35),200+f*28,300+f*28,fill=w)
    elif kind=='shield':
        p([(10,13),(20,8),(29,13),(27,22),(20,29),(13,23)],s);p([(14,15),(20,12),(25,15),(24,21),(20,25),(16,21)],a)
    elif kind=='spring':
        y=round(3*sin(t));rect((8,32,32,36),s)
        for j in (0,1,2):l([(12,31-j*3),(26,27-j*3+y),(15,25-j*3+y)],m)
        p([(9,18+y),(29,18+y),(33,21+y),(31,24+y),(8,24+y),(6,22+y)],hot)
    elif kind in ('checkpoint','terminal'):
        rect((10,32,29,36),s);rect((17,12,21,32),s)
        if kind=='checkpoint':
            p([(15,8),(20,4),(25,8),(24,15),(18,18),(14,13)],m);d.point((20,9+f%3),fill=a)
            l([(22,13),(29,15),(24,18)],a)
        else:
            p([(11,6),(28,6),(30,16),(25,20),(11,18)],s);rect((14,9,25,15),a)
            l([(15,12),(18,12),(20,10),(23,11)],DARK)
    elif kind in ('block','breakable'):
        rect((5,8,34,36),s);rect((8,11,31,33),SHADOW)
        l([(8,30),(28,11)],m,2);l([(11,33),(31,14)],m)
        if kind=='breakable':l([(19,10),(14,19),(22,20),(18,29),(23,35)],hot,2)
        for x in (8,31):
            for y in (11,33):d.point((x,y),fill=w)
    elif kind=='battery':
        rect((12,12,27,30),s);rect((16,9,23,12),m)
        for y in (15,19,23):rect((16,y,23,y+2),a)
    elif kind=='spike':
        for x,y in [(9,23),(17,15),(25,19)]:p([(x-4,34),(x,y),(x+4,34)],m)
        rect((4,33,32,36),SHADOW)
    elif kind in ('crawler','drone','turret','sentry','eel','wisp'):
        if kind=='crawler':
            for j in (0,1,2):l([(12+j*5,25),(9+j*5+dy,29),(7+j*6+dy,29)],m,2)
            p([(6,23),(11,16),(21,14),(30,19),(33,24),(28,27),(9,27)],s)
        elif kind=='drone':
            yy=19+dy
            l([(4,yy-3),(14,yy),(26,yy),(35,yy-4)],s,3)
            for x in (7,31):oval((x-4,yy-5,x+4,yy-2),m)
            p([(12,yy),(17,yy-4),(24,yy-3),(28,yy+1),(22,yy+5),(14,yy+4)],s)
        elif kind=='turret':
            rect((7,29,32,34),s);p([(12,30),(13,20),(19,16),(25,18),(28,29)],SHADOW)
            l([(18,21),(7,17+dy)],s,5)
        elif kind=='sentry':
            for j in (-1,1):l([(20+j*4,23),(20+j*7,29+dy*j),(20+j*9,34)],s,3)
            p([(10,14),(16,10),(27,12),(31,17),(25,26),(15,25)],m)
        elif kind=='eel':
            pt=[(4+x,22+round(4*sin(t+x*.21))) for x in range(0,30,3)]
            l(pt,s,5);l([(x,y-1) for x,y in pt],m)
        else:
            p([(12,22+dy),(10,13+dy),(18,16+dy),(23,6+dy),(26,14+dy),(30,20+dy),(22,27+dy)],'#b79ec8')
        l([(17,19+dy),(22,19+dy)],hot,2)
    elif kind in ('pulse','shard','beam','disc','friendly','mine'):
        c=a if kind=='friendly' else hot
        if kind=='mine':
            for j in range(6):
                x=round(cos(j*pi/3)*8);y=round(sin(j*pi/3)*8);l([(20,21),(20+x,21+y)],m,2)
            oval((15,16,25,26),c);oval((18,19,22,23),DARK)
        if kind in ('pulse','friendly','beam'):
            l([(5,20),(26,20)],c,2);p([(15,20),(24,17),(32,20),(24,23)],w)
        if kind=='shard':p([(11,25),(18,17),(29,13),(22,21)],c)
        if kind=='disc':d.ellipse((10,16,30,23),outline=c,width=3);l([(13,20),(27,18)],w)
    elif kind=='larpking':
        # Lean cybernetic archivist, split steel collar and monocular survey rig.
        for x in (15,24):l([(x,25),(x+dy,32),(x+2,36)],s,3)
        p([(14,14),(20,10),(27,14),(27,21),(30,31),(18,28),(10,31)],SHADOW)
        p([(13,14),(15,10),(20,15),(25,9),(28,14),(22,20)],m)
        p([(15,5),(18,3),(24,4),(25,10),(20,15),(16,11)],s)
        l([(17,8),(24,7)],hot,2);l([(23,15),(26,19),(32,17+dy)],m,3)
    else:
        c={'fire':hot,'boost':'#a4dcff','telekinesis':'#acecc9','rain':s,'smoke':SHADOW,'debris':m}.get(kind,a)
        for j in range(5):
            k=j*2*pi/5+(TYPES.index(kind)%6)*.25;r=2+f*2
            x=round(20+cos(k)*r);y=round(20+sin(k)*r)
            if kind in ('shock','transform','splash'):d.arc((20-r,20-r,20+r,20+r),j*72+f*10,j*72+f*10+33,fill=c)
            else:l([(x,y),(x+round(cos(k)*3),y+round(sin(k)*3))],c,2)
    return im
