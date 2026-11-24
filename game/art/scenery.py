"""Original layered 16-bit environments; all coordinates are logical pixels."""
import math, random
from PIL import Image, ImageDraw
from characters import ACCENTS,INK,DARK,SHADOW,STEEL,SILVER,WHITE,draw_hero

ZONES=['Neon Horizon','Black Forge','Afterimage District','Frosted Zero','Aura Sanctuary','Orbital Ascension','Protocol X','The Unseen Moon']
COLORS=['#75cee0','#ed925f','#e58eab','#97d9ef','#82d8ac','#e8b585','#f27576','#c9ace8']
SKIES=[('#151b31','#5b596a'),('#222332','#755551'),('#231c3d','#735879'),('#232e4c','#828f9f'),('#172c31','#49655f'),('#17182a','#535d71'),('#231b28','#684858'),('#171627','#48445e')]
def rgb(s):return tuple(bytes.fromhex(s.lstrip('#')))
def mix(a,b,t):
    if isinstance(a,str):a=rgb(a)
    if isinstance(b,str):b=rgb(b)
    return tuple(round(x+(y-x)*t) for x,y in zip(a,b))

def sky(zone):
    im=Image.new('RGB',(480,270));d=ImageDraw.Draw(im)
    lo,hi=SKIES[zone]; col=COLORS[zone]; rng=random.Random(90+zone)
    for y in range(270):
        t=min(1,int(y/11)*11/230)
        d.line((0,y,480,y),fill=mix(lo,hi,t))
        if y%11 in (0,1):
            for x in range((y%2)*2,480,4):d.point((x,y),fill=mix(lo,hi,max(0,t-.035)))
    for i in range(100 if zone in (5,7) else 28):
        x=rng.randrange(480);y=rng.randrange(135)
        d.point((x,y),fill=mix(lo,SILVER,rng.random()*.5+.14))
        if i%19==0:d.line((x-1,y,x+1,y),fill=mix(lo,col,.6))
    # Crescent and thin atmosphere remain behind towers, floating ruins or the station.
    if zone in (0,2,4,5,7):
        x=[364,0,75,0,342,378,0,325][zone];y=58;r=35 if zone in (5,7) else 23
        d.ellipse((x-r,y-r,x+r,y+r),fill=mix(hi,col,.45))
        d.ellipse((x-r-7,y-r-3,x+r-9,y+r-6),fill=mix(lo,hi,.23))
        for j in range(10):
            u=rng.randint(-r,r);v=rng.randint(-r,r)
            if u*u+v*v<r*r and (u+8)**2+(v+4)**2>r*r:d.line((x+u,y+v,x+u+2,y+v),fill=mix(hi,col,.25))
    for i in range(48 if zone in (0,1,3,4) else 10):
        x=rng.randrange(480);y=rng.randrange(25,170);w=rng.randrange(5,52)
        d.line((x,y,x+w,y),fill=mix(mix(lo,hi,min(1,y/220)),hi,.22),width=1+rng.randrange(2))
    return im

def architecture(zone,near):
    W=480;im=Image.new('RGBA',(W,270));d=ImageDraw.Draw(im)
    rg=random.Random(zone*97+near*7+92);lo,hi=SKIES[zone];a=COLORS[zone]
    wall=mix(lo,hi,.13 if near else .5);mid=mix(lo,hi,.37 if near else .65);rim=mix(mid,a,.22)
    def rect(x,y,w,h,c):d.rectangle((x,y,x+w-1,y+h-1),fill=c)
    def thick(pts,width):
        d.line(pts,fill=wall,width=width);d.line([(x,y-1) for x,y in pts],fill=mid,width=max(1,width//3))
    def building(x,y,w):
        rect(x,y,w,270-y,wall);rect(x,y,w,2,rim);rect(x+w-4,y,4,270-y,mid)
        for wy in range(y+9,264,8 if near else 6):
            for wx in range(x+3,x+w-5,6):
                if rg.random()<.55:
                    rect(wx,wy,2+int(near),1+int(near),mix(mid,a,.32 if rg.random()<.82 else .8))
    if zone in (0,2):
        x=-10
        while x<480:
            w=rg.randrange(17,55) if near else rg.randrange(12,31)
            y=rg.randrange(95,200) if near else rg.randrange(78,165)
            building(x,y,w)
            r=rg.randrange(3,12); rect(x+3,y-r,w-9,r,mid)
            if rg.random()<.45:
                d.line((x+w*.45,y-r-21,x+w*.45,y-r),fill=rim)
                d.point((x+w*.45,y-r-22),fill=a)
            if near and zone==2:
                xx=x+3;yy=y+10
                d.rounded_rectangle((xx,yy,xx+6,yy+25),radius=2,fill=wall,outline=a)
                for offset in range(3,22,5):d.line((xx+2,yy+offset,xx+4,yy+offset+1),fill=a)
            x+=w+rg.randrange(2,12)
        if near and zone==0:
            thick([(-8,206),(110,198),(246,204),(482,178)],5)
            for x in [20,165,360]:d.line((x,198,x+4,267),fill=wall,width=5)
        if near and zone==2:
            for x,y,r in [(86,168,30),(365,155,23)]:
                d.ellipse((x-r,y-r,x+r,y+r),outline=mid,width=3)
                for j in range(8):
                    k=j*math.pi/4;d.line((x,y,x+math.cos(k)*r,y+math.sin(k)*r),fill=rim)
    elif zone==1:
        for x in range(-10,480,38 if near else 23):
            y=rg.randint(103,199);w=rg.randint(12,25)
            if rg.random()<.55:
                d.polygon([(x,y),(x+w,y),(x+w-3,202),(x+w+5,245),(x-5,245),(x+3,202)],fill=wall)
                rect(x-1,y,w+2,3,rim)
                for i in range(4):rect(x+1,y+9+i*20,w-1,2,mid)
            else:
                building(x,y+15,w)
                d.polygon([(x-5,y+16),(x+w//2,y-4),(x+w+4,y+16)],fill=wall)
            if near:
                thick([(x-23,y+63),(x-4,y+63),(x+3,y+55),(x+22,y+55)],5)
                if x%3==0:rect(x+3,y+29,3,14,a)
        if near:thick([(0,212),(130,212),(143,201),(268,201),(278,209),(480,209)],9)
    elif zone==3:
        for x in range(-45,500,19):
            y=rg.randint(115,197) if near else rg.randint(80,160);w=rg.randint(18,50)
            d.polygon([(x-20,270),(x+4,y+22),(x+w//2,y),(x+w//2+4,y+2),(x+w,225),(x+w+16,270)],fill=wall)
            d.polygon([(x+w//2,y),(x+w//2+4,y+2),(x+w-3,217),(x+w//2+7,194)],fill=mid)
            d.line([(x+4,y+22),(x+w//2,y),(x+w//2+3,y+2)],fill=rim)
        if near:
            for x in (36,168,308,431):
                building(x,195,27);d.arc((x-9,171,x+37,211),180,360,fill=rim,width=3)
            thick([(0,224),(70,224),(83,216),(190,216),(205,224),(353,224),(369,217),(480,217)],6)
    elif zone==4:
        for j in range(7 if near else 11):
            x=j*(75 if near else 47)+rg.randrange(-12,8);y=rg.randrange(105,208);w=rg.randrange(30,65)
            d.polygon([(x,y),(x+w,y-4),(x+w-6,y+7),(x+w//2,y+24),(x+12,y+13)],fill=wall)
            d.line((x,y,x+w,y-4),fill=rim,width=2)
            for k in range(3):
                u=x+rg.randrange(3,w-5);h=rg.randrange(9,42)
                d.polygon([(u,y-1),(u+2,y-h),(u+5,y-h-3),(u+6,y-2)],fill=mid)
            for k in range(3):
                u=x+rg.randrange(5,w-4);d.line([(u,y+5),(u+1,y+11),(u-2,y+18)],fill=mid)
        if near:d.arc((74,127,165,226),190,355,fill=mid,width=4)
    elif zone==5:
        for x in range(0,480,75 if near else 45):
            y=rg.randrange(154,224) if near else rg.randrange(82,170)
            if x%2:
                d.ellipse((x-19,y-12,x+20,y+12),outline=mid,width=4)
                thick([(x-15,y+4),(x+18,y-4)],3)
                for v in (-1,1): rect(x+v*18-5,y-4,12,8,mid)
            else:
                d.polygon([(x,y-26),(x+5,y-10),(x+6,y+34),(x+10,y+44),(x-10,y+44),(x-5,y+32),(x-4,y-10)],fill=wall,outline=mid)
                d.line((x+2,y-6,x+2,y+24),fill=rim)
        if near:
            thick([(0,213),(90,213),(165,234),(273,234),(363,217),(480,217)],6)
            for x in range(0,480,48):d.line((x,219,x-13,266),fill=wall,width=4)
    elif zone==6:
        for x in range(-20,480,50 if near else 34):
            y=rg.randrange(95,182);w=rg.randint(27,46)
            d.polygon([(x,267),(x,y+20),(x+7,y+9),(x+7,y),(x+w-5,y),(x+w,y+11),(x+w,267)],fill=wall)
            rect(x+9,y+3,w-19,2,rim)
            for j in range(5):rect(x+5,y+26+j*5,w-12,2,mid)
            d.line([(x+w-7,y+10),(x+w-7,y+64),(x+w-14,y+71),(x+w-14,256)],fill=rim)
            if near:rect(x+10,y+22,2,22,a)
    else:
        for j in range(18 if not near else 9):
            x=rg.randrange(480);y=rg.randrange(83,240);r=rg.randrange(3,15)
            d.polygon([(x-r,y-2),(x-r//2,y-r),(x+r//3,y-r),(x+r,y-2),(x+r//2,y+r),(x-r//2,y+r//2)],fill=wall,outline=mid)
        ridge=[(0,218)]
        for x in range(0,491,10):ridge.append((x,round((202 if near else 177)+15*math.sin(x*.043)+rg.randrange(-6,5))))
        d.polygon(ridge+[(480,270),(0,270)],fill=wall);d.line(ridge,fill=mid,width=2)
        if near:
            for x in [56,228,421]:
                y=194;d.polygon([(x-8,y+17),(x-3,y-24),(x+1,y-32),(x+6,y+16)],fill=wall,outline=mid)
    return im

def tile(zone):
    """32px repeatable floor material, excluding the separately rendered collision edge."""
    im=Image.new('RGB',(32,32));d=ImageDraw.Draw(im);a=COLORS[zone]
    lo,hi=SKIES[zone];bg=mix(lo,'#101521',.39);s=mix(bg,hi,.38)
    d.rectangle((0,0,31,31),fill=bg)
    if zone in (0,5,6):
        d.line([(0,0),(21,0),(25,4),(31,4)],fill=s)
        d.line([(2,2),(19,2),(23,6),(31,6)],fill=mix(bg,hi,.19))
        for y in (12,15,18):d.line((6,y,17,y),fill=s)
        d.rectangle((24,21,26,23),outline=s);d.line((2,29,20,29),fill=s)
        if zone==5:d.line([(0,24),(9,24),(14,20),(31,20)],fill=s)
        if zone==6:d.line([(0,7),(7,7),(12,12),(12,29)],fill=mix(s,a,.25))
    if zone==1:
        for i in range(-30,56,8):d.line((i,0,i-13,31),fill=s,width=3)
        for y in [4,26]:d.line((0,y,31,y),fill=DARK,width=3)
    if zone==2:
        d.polygon([(0,16),(16,0),(31,16),(16,31)],outline=s)
        d.rectangle((12,12,19,19),outline=mix(s,a,.25))
    if zone==3:
        for ps in [[(1,3),(11,9),(16,22),(29,27)],[(16,22),(10,27),(7,32)],[(11,9),(20,5),(23,0)]]:d.line(ps,fill=s)
    if zone==4:
        for y in (3,16,30):d.line((0,y,31,y),fill=s)
        d.line((7,4,7,15),fill=s);d.line((25,17,25,30),fill=s);d.arc((-4,13,14,30),200,295,fill=mix(s,a,.2))
    if zone==7:
        d.ellipse((10,6,24,11),outline=s);d.ellipse((12,7,22,10),fill=DARK);d.arc((-3,20,10,27),200,360,fill=s)
    return im

def title_scene():
    im=sky(0).convert('RGBA')
    for near in (False,True):im.alpha_composite(architecture(0,near))
    d=ImageDraw.Draw(im);r=random.Random(92)
    # A monumental stepped transmission tower rises through the original city.
    d.polygon([(263,223),(273,138),(276,138),(283,83),(287,83),(291,50),(296,50),(298,24),(301,12),(304,53),(309,53),(311,81),(318,87),(325,135),(331,135),(341,225)],fill='#292c3c')
    d.line([(275,158),(286,90),(295,65),(299,27)],fill='#92a9b0',width=2)
    for y in range(65,191,6):
        w=round((y-60)*.13)+3;d.line((300-w,y,300+w,y-1),fill='#596779')
        if y%4==1:d.line((301,y-1,302+w,y-2),fill='#77ced4')
    for j in range(3):d.arc((273-j*6,38-j*5,327+j*6,70+j*5),195,333,fill='#656b7c')
    # Suspended bridge, with a continuous contact surface and shallow puddle reflections.
    d.polygon([(0,195),(137,203),(273,181),(480,173),(480,270),(0,270)],fill='#262d39')
    d.line([(0,194),(137,202),(273,180),(480,172)],fill='#83999e',width=2)
    for j in range(100):
        x=r.randrange(480);y=r.randrange(204,269);l=r.randrange(3,27)
        d.line((x,y,min(479,x+l),y),fill=r.choice(('#384457','#37404c','#566879','#605c67')))
    for x,y in ((386,141),(403,152),(440,130)):
        d.line((x-5,y,x+4,y),fill='#d5bcb0');d.line((x-11,y+1,x-3,y+1),fill='#809fae')
    # Overhead piping provides a near silhouette and natural left title-safe region.
    d.polygon([(0,0),(200,0),(164,7),(92,9),(72,21),(0,28)],fill='#101623')
    for x in range(0,143,18):d.line((x,13,x+8,5),fill='#353847',width=3)
    d.line([(0,36),(41,35),(72,28),(125,9)],fill='#1d2232',width=2)
    for j in range(44):
        x=r.randrange(480);y=r.randrange(155,266);d.line((x,y,x-2,y+5),fill='#566070')
    # The courier is backlit against the diagonal platform rather than over UI typography.
    sprite=draw_hero(0,'cinematic',2).resize((96,96),Image.Resampling.NEAREST)
    im.alpha_composite(sprite,(321,129))
    return im.convert('RGB')
