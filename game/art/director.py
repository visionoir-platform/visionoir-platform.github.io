"""Dr Larpking: gaunt, retractable optical crown, segmented mantle and survey cane."""
from math import sin,cos,pi
from PIL import Image, ImageDraw
from characters import INK,DARK,STEEL,SILVER,WHITE,SHADOW
STATES=['walk','laugh','dialogue','reaction','board','pilot','anger','defeat','escape','arrival','overdrive']
def draw_director(state,f):
    im=Image.new('RGBA',(64,64));d=ImageDraw.Draw(im)
    t=f*pi/3; moving=state in ('walk','escape','arrival','board')
    cx=31+(2 if state=='escape' else 0)
    cy=22+round(sin(t))+(8 if state=='defeat' else 2 if state in ('pilot','board') else 0)
    accent='#ff8d79';light='#dbcec5';coat='#525368'
    def p(coords,color):d.polygon(coords,fill=color,outline=INK)
    def l(coords,color,w=1):d.line(coords,fill=color,width=w)
    for s in (-1,1):
        foot=31+s*4+(round(sin(t)*s*(10 if state=='escape' else 6)) if moving else 0)
        y=54-(round(max(0,cos(t)*s)*3) if moving else 0)
        if state=='pilot':foot+=6;y-=4
        l([(cx+s*2,cy+16),(cx+s*5,cy+23),(foot,y-1)],INK,5)
        l([(cx+s*2,cy+16),(cx+s*5,cy+23),(foot,y-1)],STEEL,3)
        l([(foot-2,y),(foot+4,y)],SILVER,2)
    for s in (-1,1):
        p([(cx+s*3,cy+4),(cx+s*7,cy+7),(cx+s*5,cy+15),(cx+s*10,cy+25),(cx+s*5,cy+23),(cx,cy+15)],coat)
    p([(cx-7,cy+3),(cx-3,cy+1),(cx+4,cy+2),(cx+8,cy+4),(cx+4,cy+17),(cx-4,cy+16)],SHADOW)
    p([(cx-8,cy+2),(cx-6,cy-3),(cx,cy+3),(cx+6,cy-3),(cx+8,cy+3),(cx+2,cy+9)],SILVER)
    l([(cx-4,cy+8),(cx+2,cy+11),(cx+2,cy+14)],accent)
    hx=cx;hy=cy-5-(1 if state=='laugh' else 0)
    p([(hx-4,hy-6),(hx-1,hy-9),(hx+3,hy-8),(hx+6,hy-5),(hx+5,hy),(hx+2,hy+4),(hx-3,hy+2),(hx-5,hy-1)],light)
    p([(hx-4,hy-6),(hx-2,hy-9),(hx+3,hy-8),(hx+3,hy-5),(hx-2,hy-3),(hx-2,hy+1),(hx-5,hy)],STEEL)
    l([(hx-1,hy-4),(hx+5,hy-5)],INK,3);l([(hx+1,hy-4),(hx+5,hy-5)],accent)
    if state in ('laugh','dialogue','anger','overdrive'):l([(hx+2,hy+1),(hx+4,hy+1+(f%2))],INK)
    handx=cx+10;handy=cy+13
    if state in ('dialogue','laugh','reaction','anger','overdrive'):
        handx+=round((1+sin(t))*3);handy-=8+(4 if state in ('anger','overdrive') else 0)
    elif state in ('pilot','board'):handx+=4;handy-=5
    l([(cx+5,cy+5),(cx+8,cy+10),(handx,handy)],INK,5);l([(cx+5,cy+5),(cx+8,cy+10),(handx,handy)],SILVER,3)
    if state in ('walk','arrival','dialogue','reaction'):
        l([(handx+1,handy-4),(handx+1,53)],INK,3);l([(handx+1,handy-4),(handx+1,53)],STEEL)
        d.point((handx+1,handy-5),fill=accent)
    if state in ('overdrive','anger','pilot'):
        for j in range(3):
            k=hx-7+j*4;p([(k,hy-5),(k-1,hy-12-j),(k+2,hy-9-j),(k+2,hy-5)],accent)
    return im
