"""Compile the localized library labels; preserve commissioned OST titles unaltered."""
import json
from pathlib import Path
from render_effects import gestures
from render import WEB

ORDER='it es de fr pt-PT ru uk pl ar sw rm-CH zh-Hans ja ko'.split()
BRAZIL={
'land':'Aterrissagem','spring':'Mola','rail-grind':'Deslize no trilho','wall-grip':'Agarrar a parede',
'dash-release':'Soltar impulso','dive':'Mergulho','checkpoint':'Ponto de controle','bonus-key':'Chave de bônus',
'shield-break':'Escudo quebrado','punch':'Soco','combo-kick':'Chute em sequência','combo-finish':'Finalização da sequência',
'velocity-rail-flare':'Faísca no trilho','aura-grip':'Pegada telecinética','amber-beacon':'Sinalizador de âmbar',
'guardian-call':'Chamado do guardião','door-close':'Fechamento da porta','geyser':'Gêiser','bumper':'Rebatedor',
'menu-tab':'Mudança de aba','save':'Salvamento','countdown':'Contagem regressiva','signal-close':'Encerramento do sinal',
'transform-end':'Retorno à forma inicial','turret-fire':'Disparo da torreta'}
ENGLISH={'hit':'Damage Taken','ring-chain':'Ring Chain','score-tick':'Score Counter','invulnerable':'Invulnerability',
         'super-chrome':'Chrome Ascension','super-obsidian':'Obsidian Chaos','super-quantum':'Quantum Ascension',
         'super-crimson':'Crimson Overdrive','super-solar':'Solar Circuit','record':'New Record','boss-telegraph':'Boss Attack Warning',
         'menu-select':'Confirm Selection','menu-move':'Move Selection','menu-back':'Menu Back','after-credits':'After the Credits'}
def compile_names():
    maps={k:{} for k in ORDER+['en']}
    ids=[i for _,i,_ in gestures()]
    for row in Path(__file__).with_name('effect-names.tsv').read_text().splitlines():
        if not row or row.startswith('#'):continue
        key,*values=row.split('|')
        assert key in ids and key not in maps['it'] and len(values)==len(ORDER) and all(v.strip() for v in values),key
        for lang,value in zip(ORDER,values):maps[lang][key]=value
        maps['en'][key]=ENGLISH.get(key,key.replace('-',' ').title())
    assert list(maps['it'])==ids
    maps['de-CH']={k:v.replace('ß','ss') for k,v in maps['de'].items()}
    maps['it-CH']=maps['it'];maps['fr-CH']=maps['fr'];maps['pt-BR']=maps['pt-PT']|BRAZIL
    out=WEB/'names';out.mkdir(exist_ok=True)
    for lang,content in maps.items():
        assert len(content)==118 and len(set(content.values()))==118,lang
        (out/(lang+'.json')).write_text(json.dumps(content,ensure_ascii=False,indent=2)+'\n')
    print('Compiled',len(maps),'localizations ×',len(ids),'effects.')
if __name__=='__main__':compile_names()
