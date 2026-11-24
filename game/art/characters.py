"""Original articulated pixel drawings. Origin is the midpoint between grounded feet."""
from math import sin, cos, pi
from PIL import Image, ImageDraw

INK='#10101a'; DARK='#292838'; SHADOW='#444658'; STEEL='#75818b'; SILVER='#b9c6c7'; WHITE='#f1f1d9'
NAMES=['Vela','Offset','Ione','Maglio','Spola']
ACCENTS=['#72cdeb','#fb7887','#81dfbe','#f59a6d','#ffd276']
LIT=['#c8f6ff','#ffb6a4','#c8ffdd','#ffe2ab','#fff1b6']
# Raised sail helmet, slit mask, floating ceramic diadem, welding hood, goggles.
HEADS=[
['      ss      ','    sswwss    ','   swmmmmmss  ','  swmmmddmmms ',' sdmmddddmmwww','sdddddmmmttttd','  sddmmddttttd','   sddmtttttss','   sdddddmss  ','    sddss     '],
['     dds      ','    dsms      ','  ddsmmsdd    ',' dsmmsdddss   ','dsmssdddddss  ','dddsdmmmmmtttd','  ddddssstttsd','   ddssdddddd ','    dsmssdds  ','     dddsdd   '],
['  ss      ws  ',' ssws    sws  ','  smss  smms  ','  swwmmmwws   ','  smwwwwmmws  ',' swwmmmmmmmws ',' ssssmmmtttds ','   smmtttttds ','    smmmdmss  ','     smmwss   '],
['  dddddddd    ',' dsmwwwwmmdd  ','dswwsmmmmsssd ','dssmmmmmddmsd ','dsmddmmwwwwsd ','dsmmdtttttttd ',' dmmddttttddd ',' dssmddssmmdd ','  dsmmmsdmms  ','    ddwwssd   '],
['     dss    ds','    dswss  dsd','  sssmmmssddsd',' smwmmmsmwwssd','smsmmmsmwwwsss','dswttssdtttwdd','dsmtttsdtttwds',' dsmsssmsmsssd','  dsmmmsssms  ','   ddsssdss   ']
]
POSES=['idle','idleLong','blink','walk','jog','run','max','accelerate','skid','turn','crouch','look','jump','fall','land','roll','charge','dash','push','balance','spring','grind','swim','drown','hurt','knockback','defeat','respawn','victory','select','dialogue','cinematic','attack','special','transform','superAttack','revert','hover','fly','climb','glide','trick']
NFRAMES=8

def draw_hero(hero, pose, f=0, super_form=False):
    im=Image.new('RGBA',(64,64)); d=ImageDraw.Draw(im)
    t=f*2*pi/NFRAMES
    a=ACCENTS[hero]; hi=LIT[hero]; lit=WHITE if super_form else SILVER
    def poly(pts,fill,outline=INK):
        d.polygon([(round(x),round(y)) for x,y in pts],fill=fill,outline=outline)
    def line(pts,col,width=1):
        d.line([(round(x),round(y)) for x,y in pts],fill=col,width=width)
    cycle=pose in ('walk','jog','run','max','accelerate','dash','climb','swim')
    speed={'walk':.45,'jog':.68,'run':.9,'max':1,'accelerate':.72,'dash':1.1,'swim':.55,'climb':.4}.get(pose,0)
    crouch={'skid':5,'crouch':9,'charge':8,'land':6,'push':3,'grind':5,'roll':10,'defeat':8}.get(pose,0)
    air=pose in ('jump','fall','glide','fly','hover','spring','trick','drown','knockback','hurt')
    breath=round(sin(t+hero*.55)*.8)
    lean=round(speed*6)+{'push':5,'skid':-4,'glide':6,'fly':6,'hurt':-5,'knockback':-5,'balance':-3,'look':-1}.get(pose,0)
    xx=31+lean; hy=18+crouch+breath-round(abs(cos(t))*speed*2)-round(2 if air else 0)
    pelvis=(31,42+crouch//2+breath-round(abs(cos(t))*speed))
    if hero==3: hy+=2
    if hero==2: hy-=2
    if pose in ('fall','spring','knockback','skid','balance','jump','trick'):
        xx+=dict(fall=0,spring=2,knockback=-2,skid=-1,balance=-2,jump=1,trick=2)[pose]
        hy+=dict(fall=-1,spring=-3,knockback=2,skid=1,balance=0,jump=1,trick=-2)[pose]
    if pose=='defeat':
        xx-=4; hy+=2; pelvis=(32,48)
    # Paired foot key poses. Foot, planted sole and chromed shinguard stay separate.
    for side in (-1,1):
        move=sin(t)*side
        foot_x=31+side*5+round(move*14*speed)
        foot_y=55-round(max(0,-cos(t)*side)*speed*8)
        knee_x=(pelvis[0]+foot_x)//2+side*3+round(max(0,move)*speed*6)
        knee_y=pelvis[1]+5
        if air:
            foot_x+=(-5 if side<0 else 2)
            foot_y-=6 if side<0 else (2 if pose=='fall' else 5)
            knee_x+=4
        if pose=='jump':foot_x+=side*2;foot_y-=max(0,side)*3
        if pose=='spring':foot_x-=side*3;foot_y+=side
        if pose=='knockback':foot_x+=7;foot_y-=max(0,side)*5
        if pose=='hover':foot_x-=side*2;foot_y+=side*3
        if pose=='turn':foot_x-=side*4;foot_y-=max(0,side)*2
        if pose=='trick':foot_x+=side*6;foot_y-=side*4
        if pose=='grind': foot_x+=side*3; knee_x+=6
        if pose in ('skid','land','balance','push'): foot_x+=side*4
        if pose in ('climb','glide','fly'): foot_x-=6;foot_y-=4
        if pose=='defeat': foot_x+=4; foot_y-=2
        hipx,hipy=pelvis
        color=SHADOW if side<0 else STEEL
        line([(hipx,hipy),(knee_x,knee_y),(foot_x,foot_y-3)],INK,6)
        line([(hipx,hipy),(knee_x,knee_y),(foot_x,foot_y-3)],color,4)
        line([(knee_x,knee_y+1),(foot_x,foot_y-4)],a if side==1 else DARK,2)
        poly([(foot_x-3,foot_y-5),(foot_x+2,foot_y-5),(foot_x+3,foot_y-2),(foot_x+6,foot_y-1),(foot_x+6,foot_y+1),(foot_x-4,foot_y+1)],DARK)
        line([(foot_x-2,foot_y),(foot_x+5,foot_y)],lit)
    shoulder=(xx,hy+11); sx,sy=shoulder
    # Equipment alters the perimeter both behind and above the actor.
    if hero==0: # messenger's rigid sail pack with fluttering foil streamers
        poly([(sx-4,sy-4),(sx-10,sy-9),(sx-9,sy+2),(sx-16,sy+8+breath),(sx-6,sy+5)],STEEL)
        line([(sx-9,sy-5),(sx-7,sy+2),(sx-13,sy+6+breath)],hi)
    elif hero==1: # split long insulated coat
        poly([(sx-2,sy-4),(sx+5,sy+1),(sx,sy+8),(sx-4,sy+17),(sx-7,sy+13),(sx-14,sy+17+breath),(sx-8,sy+2)],SHADOW)
        line([(sx-4,sy),(sx-10,sy+12+breath)],a)
    elif hero==2: # levitating tuning fork
        for j in (-1,1):
            ex=sx-10+j*6; ey=sy-4+round(2*sin(t+j))
            poly([(ex-2,ey-6),(ex+1,ey-9),(ex+3,ey-5),(ex,ey+1)],hi)
    elif hero==3: # hydraulic shoulder and cylinder
        poly([(sx-5,sy-6),(sx-10,sy-5),(sx-11,sy+5),(sx-6,sy+11),(sx-3,sy+6)],STEEL)
        line([(sx-8,sy-4),(sx-9,sy+3)],lit,2)
    else: # field engineer's folded double rotor on a tapered backpack
        poly([(sx-6,sy-5),(sx-11,sy-4),(sx-12,sy+6),(sx-8,sy+11),(sx-5,sy+7)],STEEL)
        line([(sx-11,sy),(sx-14,sy-9),(sx-13,sy-13)],a,2)
        if pose in ('fly','hover','special','superAttack'):
            blade=round(cos(t)*10)
            line([(sx-13-blade,sy-11),(sx-13+blade,sy-13)],WHITE,2)
    hw=[5,5,5,8,5][hero]
    poly([(sx-hw,sy-3),(sx+hw,sy-2),(sx+hw+1,sy+4),(pelvis[0]+4,pelvis[1]+1),(pelvis[0]-4,pelvis[1]),(sx-hw-1,sy+3)],STEEL if hero in (0,2) else SHADOW)
    poly([(sx-hw+1,sy-2),(sx+hw-1,sy-2),(sx+hw-2,sy+2),(sx,sy+5),(sx-hw+1,sy+2)],lit)
    line([(sx-4,sy+3),(sx+2,sy+5),(sx+4,sy+3)],a,2)
    line([(pelvis[0]-4,pelvis[1]-2),(pelvis[0]+4,pelvis[1]-1)],DARK,3)
    for side in (-1,1):
        arm=round(sin(t+pi)*side*9*speed)
        ex=sx+side*(6+(hero==3))+arm; ey=sy+5+breath
        handx=ex+round(arm*.6)+2; handy=ey+5
        if pose in ('victory','transform','revert'): ex=sx+side*9;ey=sy-3;handx=ex+side*2;handy=ey-5+breath
        if pose in ('attack','superAttack','special','push','dialogue') and side==1:
            ex=sx+7;ey=sy+1; handx=ex+round((1-cos(t))*3)+3;handy=ey-1
        if pose in ('balance','glide','trick','fly','drown'): ex=sx+side*8;ey=sy+1;handx=ex+side*3;handy=ey-2
        if pose=='jump':handx+=side*2;handy-=3
        if pose=='fall':handx+=side*3;handy-=7
        if pose=='hover':handx+=side*4;handy-=5
        if pose=='spring':handx-=side*2;handy+=1
        if pose=='hurt':handx-=4;handy-=7
        if pose=='knockback':handx-=8;handy-=7
        if pose=='turn':handx-=side*4;handy-=2
        if pose=='grind':handx+=side*5;handy-=6
        if pose=='look':handy-=2
        if pose=='select' and side<0:handx-=2;handy-=5
        if pose=='cinematic' and side<0:handx+=4;handy-=2
        if pose in ('look','select','cinematic','idleLong') and side==1: ex=sx+7;ey=sy+4;handx=ex+1;handy=ey-5-round(max(0,sin(t))*2)
        handx=max(5,min(58,handx))
        line([(sx+side*(hw-1),sy),(ex,ey),(handx,handy)],INK,6 if hero==3 else 4)
        line([(sx+side*(hw-1),sy),(ex,ey)],lit if side==1 else STEEL,3)
        d.rectangle((handx-2-(hero==3),handy-2,handx+2+(hero==3),handy+2),fill=a,outline=INK)
        line([(handx-1,handy-1),(handx+1,handy-1)],hi)
    # Articulated collar connects the helmet to the breastplate even on the lowest stride.
    neck=xx
    poly([(neck-3,hy+3),(neck+3,hy+3),(neck+4,sy-1),(neck+1,sy+2),(neck-5,sy-1)],SHADOW)
    line([(neck-2,hy+5),(neck+2,hy+6)],SILVER)
    if hero==0:
        line([(sx-5,sy-2),(sx,sy+1),(sx+4,sy)],a,2)
    elif hero==1:
        poly([(sx-5,sy-3),(sx-2,sy),(sx-3,sy+11),(sx-8,sy+14),(sx-7,sy+4)],'#6e5368')
        line([(sx-6,sy+2),(sx-7,sy+9)],a)
    elif hero==2:
        poly([(sx-4,sy),(sx-1,sy+4),(sx-2,sy+13),(sx-5,sy+17),(sx-6,sy+10)],'#91afa8')
    elif hero==3:
        poly([(sx-10,sy-1),(sx-9,sy-5),(sx-4,sy-6),(sx+1,sy-3),(sx-2,sy+2),(sx-8,sy+3)],'#b67a63')
        line([(sx-9,sy-3),(sx-5,sy-4),(sx-2,sy-3)],hi)
    else:
        poly([(sx-7,sy-2),(sx-2,sy),(sx+3,sy+6),(sx,sy+8),(sx-5,sy+3)],'#a88f63')
        line([(sx-6,sy-2),(sx-3,sy),(sx,sy+4)],a)
    hpy=hy-3-(pose=='look')+(pose=='dialogue' and f in (1,2,5))
    gx=xx-6
    palette={'d':DARK,'s':SHADOW,'m':STEEL,'w':lit,'t':a}
    for y,row in enumerate(HEADS[hero]):
        for x,k in enumerate(row):
            if k!=' ':
                color=palette[k]
                if k=='t' and pose=='blink' and f in (3,4): color=SHADOW
                d.point((gx+x,hpy+y),fill=color)
    if super_form or pose in ('transform','superAttack'):
        # Five distinct unlocked attachments: foil wings, mantle, shards, pistons, sail rotors.
        if hero==0:
            for j in range(3):
                poly([(sx-6,sy+j*2),(sx-18-j*2,sy-10+j*5+breath),(sx-12,sy+2+j*2)],hi)
        elif hero==1:
            for j in range(3): line([(sx-6,sy+j*3),(sx-17+j,sy+6+j*3+breath),(sx-20+j,sy+4+j*3)],a,2)
            poly([(gx+2,hpy),(gx+4,hpy-6),(gx+6,hpy)],hi)
        elif hero==2:
            for j in range(5):
                k=t*.25+j*2*pi/5; px=xx+round(15*cos(k));py=max(5,hy+round(9*sin(k)))
                poly([(px,py-3),(px+2,py),(px,py+3),(px-2,py)],hi)
        elif hero==3:
            for side in (-1,1): poly([(sx+side*5,sy),(sx+side*9,sy-7),(sx+side*13,sy-5),(sx+side*11,sy+1)],hi)
        else:
            for j in (-1,1): poly([(sx-7,sy),(sx-12+j*6,sy-9),(sx-15+j*7,max(2,sy-14)),(sx-8,sy-3)],hi)
    if pose in ('roll','charge'):
        # Tuck existing detailed sprite in a spinning turbine; keep identifiable visor and boots.
        body=im.crop((9,hy-7,52,57)).resize((24,23),Image.Resampling.NEAREST)
        im=Image.new('RGBA',(64,64));d=ImageDraw.Draw(im)
        im.alpha_composite(body.rotate(f*45 if pose=='roll' else (f%3-1)*5,resample=Image.Resampling.NEAREST),(20,32))
        d.arc((17,30,47,57),f*45,f*45+115,fill=a,width=2)
    if pose in ('respawn','revert','transform','special','superAttack'):
        for j in range(3):
            px=15+(j*12+f*3)%34; py=54-((f*5+j*13)%37)
            d.line((px,py,px+2,py-3),fill=hi)
    if pose in ('trick','knockback'):
        # A tight aerial turn contracts the silhouette before rotation.
        tucked=im.resize((52,52),Image.Resampling.NEAREST)
        im=Image.new('RGBA',(64,64));im.alpha_composite(tucked,(6,6))
    if pose=='trick':
        angle=[-8,-24,-60,-105,-160,-225,-290,-340][f]
        im=im.rotate(angle,resample=Image.Resampling.NEAREST,center=(32,32))
    if pose=='knockback':
        im=im.rotate(10+round(4*sin(t)),resample=Image.Resampling.NEAREST,center=(32,30))
    return im

def portrait(i,frame=None):
    # Bespoke neutral busts: recollect the same visible helmets and equipment from the sprites.
    base=Image.new('RGB',(64,64),DARK);d=ImageDraw.Draw(base);a=ACCENTS[i]
    for y in range(64):
        if y%4==0:d.line((0,y,63,y),fill='#303141')
    d.polygon([(0,64),(64,8),(64,20),(12,64)],fill=SHADOW)
    for j in range(3):d.line((0,4+j*3,15-j*3,4+j*3),fill=STEEL)
    state='select' if frame is None or frame<3 else ('blink' if frame in (3,4) else 'dialogue')
    sprite=draw_hero(i,state,2 if frame is None else frame)
    bust=sprite.crop((16,10,48,42)).resize((64,64),Image.Resampling.NEAREST)
    base.paste(bust,(0,4),bust)
    d.line((2,60,18,60),fill=a,width=2)
    return base
