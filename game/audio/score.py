"""Original cue book. Motifs are scale steps, with minus for the lower octave.
A section letter selects an authored orchestration rather than another cue.
The opening pick-up, accent grid, degree progression, lead, mode and meter
are written per cue. No MIDI or samples are imported.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Cue:
    title: str
    category: str
    scene: str
    bpm: int
    tonic: int
    mode: str
    meter: int
    bars: int
    voice: str
    beat: str
    chords: tuple
    melody: tuple
    rhythm: tuple
    form: str
    color: str


def c(title, cat, scene, bpm, tonic, mode, meter, bars, voice, beat, chords, mel, rhythm, form, color):
    return Cue(title, cat, scene, bpm, tonic, mode, meter, bars, voice, beat,
               tuple(int(x) for x in chords.split()), tuple(int(x) for x in mel.split()),
               tuple(int(x) for x in rhythm.split()), form, color)


CUES = [
c("The Unseen Awakens","system","prologue",80,50,"phrygian",4,24,"glass","cinema","0 1 5 3","0 1 4 3 -2 0 6 4","0 5 11","ABDC","#9cbdff"),
c("We Design the Unseen","system","title",118,53,"dorian",4,36,"prism","electro","0 3 5 4","0 4 7 6 4 2 1 4","0 3 6 10 13","ABCDAB","#beefff"),
c("Choose Your Frequency","system","select-character",103,55,"mixolydian",4,28,"pluck","funk","0 5 1 4","4 2 1 -1 2 5 4 0","1 4 7 12","BCBD","#f3be91"),
c("Noir City Navigator","system","select-stage",90,49,"minor",4,24,"reed","broken","0 4 2 5","0 2 3 6 4 1 3 -1","0 6 9 14","ABDC","#b397f0"),
c("System Configuration","system","options",120,58,"lydian",3,32,"chip","minimal","0 2 4 1","0 1 3 4 6 5 3 1","0 3 7 10","BCAB","#9be2dc"),
c("Memory Archive","system","extras",64,52,"dorian",4,16,"keys","ambient","0 3 1 4","4 2 1 0 -2 1 3 5","1 6 12","ADBC","#deb7d2"),
c("Chrome District","campaign","stage-01",138,52,"dorian",4,80,"chip","break","0 3 5 4","0 2 4 7 6 4 2 5 3 1","0 3 6 8 11 14","ABCBDEBC","#acd5ff"),
c("Midnight Highway","campaign","stage-02",168,54,"minor",4,96,"prism","jungle","0 5 3 4","4 4 6 7 2 1 5 3 0 -1","0 2 7 9 10 14","BCDBECBD","#9baff7"),
c("Industrial Core","campaign","stage-03",129,48,"phrygian",4,72,"metal","forge","0 1 0 4","0 1 -2 4 1 3 -3 0","0 4 7 11 12","ABCDEDBC","#ffae7b"),
c("Molten Circuit","campaign","stage-04",142,51,"harmonic",4,80,"acid","four","0 3 1 4","0 1 3 4 6 4 3 1 -3 0","1 3 6 9 11 15","BCBCEDBC","#ff805f"),
c("Phantom Arcade","campaign","stage-05",115,56,"mixolydian",4,64,"clav","funk","0 3 6 4","2 4 2 0 5 6 4 3 1","0 3 5 9 12 14","ACBDEBCB","#ffa4cf"),
c("Hologram Casino","campaign","stage-06",124,53,"dorian",4,72,"brass","electro","0 2 5 4","-2 1 4 5 7 3 2 0","2 5 8 11 15","BACDEDCB","#ffbcb0"),
c("Cryogenic Facility","campaign","stage-07",87,59,"lydian",4,48,"ice","broken","0 1 4 2","6 3 1 0 2 4 3 -1","0 5 10 13","ADBECDBC","#a5e9ff"),
c("Submerged Memory","campaign","stage-08",76,50,"minor",6,28,"glass","tide","0 5 3 2","0 4 3 2 5 4 1 -2","0 5 10 15 21","ABDEDCB","#7fcbdf"),
c("Forgotten Monolith","campaign","stage-09",84,51,"phrygian",5,36,"reed","ritual","0 3 1 5","0 4 5 1 0 3 2 -2","0 4 9 14 17","ADCBEBC","#9ce6c0"),
c("Floating Ruins","campaign","stage-10",109,55,"lydian",3,80,"harp","waltz","0 2 1 4","0 3 4 7 6 2 1 5","0 2 5 7 10","ABDEBCDC","#a2f3dd"),
c("Larpking Rocket","campaign","stage-11",150,48,"dorian",4,84,"brass","break","0 1 3 4","0 0 2 3 4 5 6 7","0 4 6 9 12 14","ABCBCEDC","#f0c18e"),
c("Celestial Machine","campaign","stage-12",132,54,"harmonic",4,72,"prism","four","0 2 5 4","-3 0 4 6 7 4 1 3","0 2 6 8 10 13","ABDCEDBC","#c1b4ff"),
c("Protocol X","campaign","stage-13",136,47,"phrygian",4,80,"acid","forge","0 1 3 0","-1 0 1 0 3 4 1 -2","0 3 4 8 10 15","ACBCDECC","#ec8297"),
c("The Unseen Moon","campaign","stage-14",94,53,"lydian",4,56,"choir","cinema","0 1 5 2","7 4 3 1 2 6 4 0","0 5 8 14","ADBCEDCB","#d4d5ff"),
c("Seven Frequencies","special","special-01..07",125,57,"dorian",7,36,"bell","orbit","0 2 3 5 4 1 6","0 2 4 1 5 3 6 7","0 4 8 13 18 22 25","ABCDEBC","#dcf5c4"),
c("Larpking Transmission","boss","boss-intro",86,46,"phrygian",3,12,"metal","cinema","0 1 3 0","0 -1 0 1 4 1","0 2 7 9","ABDC","#ff8c9e"),
c("Mechanical Domination","boss","boss-standard",148,49,"minor",4,80,"brass","forge","0 3 5 4","0 4 3 0 -1 2 4 1","0 3 6 8 12 14","BCBDEBCC","#ffb57c"),
c("Rivalry Beyond Time","boss","boss-rival",156,52,"harmonic",4,84,"reed","jungle","0 5 3 4","6 7 4 3 2 4 1 0","0 2 4 7 10 13","BCDCEDBC","#d3a2ff"),
c("Orbital Destruction","boss","boss-orbital",145,50,"phrygian",5,64,"metal","orbit","0 1 4 3","0 -3 1 0 4 6 3 1","0 5 8 12 15 18","BCBCCEDC","#ff9e8b"),
c("Protocol X: Prototype","boss","boss-prototype",131,45,"phrygian",4,72,"clav","minimal","0 1 0 5","0 1 3 0 -2 1 4 -1","0 2 6 11 13","ABCBDECB","#c6a1ef"),
c("Protocol X: Omega","boss","boss-omega-x",159,47,"harmonic",4,88,"acid","jungle","0 4 1 3","-3 0 1 4 6 1 0 7","0 2 5 6 9 12 15","BCCBEDCC","#fb879c"),
c("The Unseen God Machine","boss","boss-secret",114,48,"harmonic",4,80,"choir","cinema","0 5 1 4 0 2 3 4","0 4 7 6 5 2 4 1 0","0 4 7 10 14","ADBECDCC","#eee3c8"),
c("Chromatic Ascension","event","transform",154,56,"lydian",4,48,"prism","four","0 1 4 5","0 3 4 6 7 9 6 4","0 2 4 7 10 12","BCDEBC","#fff2ad"),
c("Act Complete","event","win-act",142,55,"major",4,4,"chip","break","0 3 4 0","0 2 4 5 6 7 9 7","0 3 6 8 12","BCDC","#b3efff"),
c("Machine Destroyed","event","win-boss",124,51,"dorian",4,4,"brass","forge","0 3 4 0","0 4 7 6 4 5 7 7","0 4 7 11 14","BCDC","#ffba8d"),
c("Core Acquired","event","win-core",103,59,"lydian",3,4,"harp","waltz","0 1 4 0","0 3 4 7 9 11 7","0 2 5 8","ABDC","#adf1d8"),
c("Signal Lost","event","game-over",60,49,"minor",3,3,"keys","ambient","0 5 0","4 3 1 0 -3 -7","0 5 9","DDA","#b09fbe"),
c("Beyond the Shadows","ending","ending-normal",86,55,"mixolydian",4,40,"keys","tide","0 5 3 4","0 1 4 2 0 -1 2 5","0 4 9 14","ADBCEBA","#f7c7a6"),
c("The Truth Behind the Unseen","ending","ending-secret",78,52,"major",4,40,"choir","cinema","0 2 5 3 1 4 0 0","0 4 2 3 5 7 6 4 1 0","0 6 8 13","ADBECDA","#c0e4f6"),
c("VISIONOIR Forever","ending","credits",119,53,"dorian",4,72,"prism","electro","0 3 5 4 1 3 4 0","0 4 7 6 4 2 1 4 5 7 9 7","0 3 6 10 13","ABDCEDCA","#d1e7ff"),
c("Velocity Trial","extra","time-attack",176,57,"minor",4,96,"chip","jungle","0 5 4 3","0 2 4 3 1 4 7 6","0 2 4 6 9 12 14","BCBCEDCC","#a5e6ef"),
c("Chaos Circuit","extra","challenge",152,51,"dorian",4,80,"acid","break","0 3 2 4","0 1 3 0 5 4 7 3","0 3 5 8 11 15","CBDEBCBC","#eb9ab3"),
c("Legacy of Speed","extra","records",100,58,"major",4,28,"bell","funk","0 2 3 4","4 5 7 4 2 0 1 4","0 3 7 10 14","ABDCBA","#eddb9b"),
]
SCALES = {"major":(0,2,4,5,7,9,11),"minor":(0,2,3,5,7,8,10),"harmonic":(0,2,3,5,7,8,11),
          "dorian":(0,2,3,5,7,9,10),"mixolydian":(0,2,4,5,7,9,10),
          "phrygian":(0,1,3,5,7,8,10),"lydian":(0,2,4,6,7,9,11)}
ONESHOTS = {1,22,30,31,32,33,34,35,36}
