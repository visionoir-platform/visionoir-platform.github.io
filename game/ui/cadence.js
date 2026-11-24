/** Reduce paint frequency after sustained slow frames while physics receives every elapsed interval. */
export function createCadence(){
  let samples=0,total=0,limited=false,nextPaint=0,recovery=0;
  return {
    reset(){samples=0;total=0;nextPaint=0;recovery=0;limited=false;},
    shouldPaint(now,delta){
      if(delta>0 && delta<160){total+=delta;samples++;}
      if(total>=1200){
        const average=total/samples;
        if(average>22){limited=true;recovery=0;}
        else if(average<19 && limited && ++recovery>=2){limited=false;nextPaint=0;}
        total=0;samples=0;
      }
      if(!limited)return true;
      if(now+.5<nextPaint)return false;
      const interval=1000/30;
      nextPaint=nextPaint && now-nextPaint<interval?nextPaint+interval:now+interval;
      return true;
    },
  };
}
