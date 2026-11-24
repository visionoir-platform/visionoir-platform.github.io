"""The Larpking foundry: 23 encounter-specific machines, built from hand-plotted chassis."""
import math
from PIL import Image,ImageDraw
from characters import INK,DARK,SHADOW,STEEL,SILVER,WHITE
from scenery import COLORS

# Hull type, locomotion, armament, attachments, effective visual zone.
SPECS=[
 ('crusher','gantry','hammer',2,0),('shark','wheels','jaw',2,0),
 ('kiln','legs','piston',2,1),('crucible','tracks','pour',3,1),
 ('mantis','stilts','cards',2,2),('carousel','wheels','orbs',3,2),
 ('kite','hover','scythe',2,3),('bathysphere','spider','sonar',4,3),
 ('obelisk','hover','orbs',3,4),('mask','stilts','mirror',2,4),
 ('ramjet','hover','jet',3,5),('serpent','orbit','jaw',4,5),
 ('kiln','tracks','drill',3,6),('crucible','spider','hammer',4,6),
 ('mantis','gantry','beam',4,6),('crown','orbit','halo',5,7),
 ('kite','legs','mirror',2,0),('bathysphere','hover','pour',3,1),
 ('mask','wheels','scythe',2,2),('carousel','stilts','sonar',3,3),
 ('obelisk','spider','cards',3,4),('ramjet','gantry','drill',2,5),
 ('crown','hover','jet',4,7)]
BOSS_STATES=['entry','idle','telegraph','attack','vulnerable','hit','defeat','destruction']
HULLS={
 'crusher':[(-23,-12),(-13,-17),(16,-17),(23,-12),(20,6),(13,11),(-16,11),(-23,5)],
 'shark':[(-28,-4),(-17,-12),(-1,-14),(9,-23),(13,-13),(22,-10),(29,0),(17,7),(-11,10),(-23,4)],
 'kiln':[(-19,-8),(-11,-12),(-10,-23),(-4,-26),(7,-25),(10,-13),(18,-10),(21,6),(13,12),(-15,12),(-22,6)],
 'crucible':[(-26,-16),(-16,-19),(-11,-13),(13,-13),(17,-18),(25,-15),(17,9),(9,15),(-9,15),(-19,8)],
 'mantis':[(-17,-7),(-13,-17),(-8,-20),(0,-9),(14,-15),(23,-7),(17,0),(5,2),(-1,12),(-11,11)],
 'carousel':[(-26,-5),(-15,-11),(-9,-18),(1,-23),(11,-17),(15,-10),(25,-7),(30,0),(23,6),(-21,6),(-29,0)],
 'kite':[(-3,-23),(5,-25),(15,-8),(25,-3),(12,3),(3,15),(-6,17),(-14,4),(-25,-7),(-14,-6)],
 'bathysphere':[(-20,-9),(-12,-18),(4,-20),(17,-14),(23,-3),(21,9),(9,16),(-8,16),(-20,8)],
 'obelisk':[(-5,-28),(4,-28),(10,-19),(12,0),(18,8),(7,16),(-7,16),(-17,10),(-12,-4),(-11,-17)],
 'mask':[(-22,-17),(-15,-20),(-5,-13),(5,-13),(17,-22),(22,-18),(19,-4),(8,6),(3,14),(-5,13),(-12,3),(-18,1)],
 'ramjet':[(-29,-2),(-20,-10),(-6,-12),(5,-22),(14,-23),(10,-12),(22,-10),(28,-5),(24,4),(10,6),(4,14),(-5,13),(-7,6),(-22,6)],
 'serpent':[(-25,-5),(-17,-13),(-7,-12),(-2,-18),(8,-20),(15,-12),(24,-8),(28,-1),(22,7),(5,9),(-5,4),(-19,7)],
 'crown':[(-23,-18),(-16,-20),(-10,-10),(-5,-24),(2,-30),(6,-24),(13,-12),(19,-21),(25,-17),(18,-4),(21,8),(10,15),(-10,15),(-22,8),(-17,-4)]}

def boss_art(i,state,f):
    im=Image.new('RGBA',(112,88));d=ImageDraw.Draw(im)
    hull,move,weapon,num,z=SPECS[i];a=COLORS[z];t=2*math.pi*f/6
    health=state in ('vulnerable','hit'); dying=state in ('defeat','destruction')
    cx=55+round(2*math.sin(t) if state=='hit' else 0)
    cy=48+round(math.sin(t)*1.8)+(f if dying else 0)
    aim=(0 if state not in ('telegraph','attack') else (7 if state=='attack' else -4))
    def xy(p):return [(round(cx+x),round(cy+y)) for x,y in p]
    def L(p,color,width=1):d.line(xy(p),fill=color,width=width)
    def P(p,color,edge=INK):d.polygon(xy(p),fill=color,outline=edge)
    def O(x,y,r,fill,edge=INK):
        x,y=cx+x,cy+y;d.ellipse((round(x-r),round(y-r),round(x+r),round(y+r)),fill=fill,outline=edge)
    # Distinct suspensions transmit a part of their motion into the chassis.
    if move in ('legs','stilts','spider','gantry'):
        for j in range(num):
            sign=-1 if j%2==0 else 1;stretch=9+j*2;dy=round(math.sin(t+j)*2)
            p=[(sign*(7+j),4+j),(sign*(17+j*3),4+dy),(sign*(20+stretch),18+dy),(sign*(18+stretch),26),(sign*(24+stretch),26)]
            if move=='gantry':p[1]=(sign*(12+j),14);p[2]=(sign*(14+j),20)
            if move=='stilts':p[1]=(sign*(24+j*2),-5+dy);p[2]=(sign*(30+j),24)
            L(p,INK,6);L(p,STEEL,3);O(*p[1],3,DARK);O(*p[2],2,a)
    elif move in ('wheels','tracks'):
        if move=='tracks':P([(-24,10),(18,10),(25,17),(20,24),(-20,24),(-27,18)],SHADOW)
        for j in range(3 if move=='tracks' else 2):
            x=-16+j*(16 if move=='tracks' else 33);O(x,17,8,DARK);O(x,17,5,STEEL);O(x,17,2,SHADOW)
            L([(x,17),(x+round(4*math.cos(t)),17+round(4*math.sin(t)))],WHITE)
    elif move=='orbit':
        for j in range(num):
            k=j*2*math.pi/num+t*.25;xx=round(math.cos(k)*28);yy=round(math.sin(k)*17)
            O(xx,yy,5,STEEL);O(xx,yy,2,a)
    else:
        for j in (-1,1):
            P([(j*14,6),(j*20,8),(j*18,15),(j*13,16)],STEEL)
            L([(j*16,15),(j*15,22+round((1+math.sin(t+j))*2))],a,2)
    shape=HULLS[hull];P(shape,SHADOW)
    L(shape[:(len(shape)//2)+1],SILVER,2)
    cx2=sum(p[0] for p in shape)/len(shape)
    # Shadow plane picks up the turn into the underbody, punctuated by metal plates and vents.
    P([(x*.79+cx2*.2,y*.65+4) for x,y in shape],DARK,STEEL)
    for j in range(3):L([(7+j*3,-7),(6+j*3,-3)],SILVER)
    for j in (-1,1):O(j*12,5,1,SILVER)
    st=-1;armx=-(29+aim);army=-6+round(2*math.sin(t))
    L([(-12,-5),(-19,-8),(armx,army)],INK,8);L([(-12,-7),(-19,-10),(armx,army-2)],STEEL,4);O(-18,-8,4,SHADOW)
    if weapon in ('hammer','piston'):P([(armx-6,army-9),(armx+3,army-9),(armx+5,army+9),(armx-6,army+10)],STEEL);L([(armx-4,army-6),(armx-4,army+6)],a,2)
    elif weapon in ('drill','jet'):P([(armx+4,army-7),(armx+4,army+6),(armx-13,army+1)],SILVER);L([(armx-4,army-2),(armx-6,army+3)],DARK)
    elif weapon in ('jaw','scythe'):P([(armx+4,army-7),(armx-10,army-6),(armx-14,army+3),(armx-6,army+9),(armx-9,army+2),(armx,army-2)],SILVER)
    elif weapon in ('cards','mirror'):P([(armx-5,army-11),(armx+5,army-4),(armx+2,army+7),(armx-9,army)],a)
    elif weapon in ('sonar','beam','pour'):P([(armx-7,army-5),(armx+5,army-5),(armx+5,army+5),(armx-7,army+5)],STEEL);O(armx-6,army,4,a)
    else:
        for j in range(3):
            k=t+j*2*math.pi/3;O(armx+math.cos(k)*6,army+math.sin(k)*6,3,a)
    # Vulnerable core visually opens. State is communicated by shape as well as accent.
    O(0,-2,8 if health else 6,STEEL);O(0,-2,6 if health else 4,a)
    if health:P([(-3,-3),(0,-6),(3,-3),(0,2)],WHITE)
    else:L([(-4,-3),(4,-3)],WHITE)
    if state=='telegraph':
        for j in (-1,1):L([(armx-7,army+j*9),(armx-13,army+j*12)],WHITE)
    if state=='attack':L([(armx-7,army),(armx-13-f%3,army-2)],a,3)
    if dying:
        for j in range(8):
            k=j*math.pi/4+t*.15;rx=round((7+f*3)*math.cos(k));ry=round((7+f*3)*math.sin(k));L([(rx,ry-3),(rx+3,ry-6)],a,2)
    return im
