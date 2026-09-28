"""Audio for the "reasons" card videos (v6/v7/v8): ElevenLabs music + a pop when each card's emoji lands.

    python3 mixcards.py v6-reasons       # after `node render.mjs v6-reasons`

Reads the cards from the page (window.CARDS), so the pops follow the timing in reasons.js.
Writes out/NAME.mp4 (music, -14 LUFS) and out/NAME-nomusic.mp4 (pops only, -20 LUFS, for a trending
sound added in the app). Files: vo/v6/music.mp3 (ElevenLabs flow "CHAOS promo — reasons videos (v6)")
and vo/v6/pop.mp3.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

here = Path(__file__).parent
FF = imageio_ffmpeg.get_ffmpeg_exe()


def main():
    name = sys.argv[1]
    src = (here / f'{name}.html').read_text(encoding='utf-8')
    cards = json.loads(re.search(r'window\.CARDS = (\[.*?\]);', src, re.S).group(1))
    t, pops = 0.0, []
    for c in cards:
        pops.append(t + 0.2 + len(c['lines']) * 0.3)   # same as reasons.js: when the emoji pops in
        t += c['dur']
    dur = t
    video = here / 'out' / f'{name}.video.mp4'
    pop = here / 'vo' / 'v6' / 'pop.mp3'
    delays = ''.join(f"[{i + 2}:a]adelay={int(p * 1000)}|{int(p * 1000)},volume=0.8[p{i}];" for i, p in enumerate(pops))
    popmix = ''.join(f'[p{i}]' for i in range(len(pops))) + f'amix=inputs={len(pops)}:normalize=0[pops]'
    inputs = ['-i', video, '-i', here / 'vo' / 'v6' / 'music.mp3'] + sum((['-i', pop] for _ in pops), [])
    for suffix, graph in (
        ('', f"[1:a]atrim=0:{dur},afade=t=out:st={dur - 1.2}:d=1.2,loudnorm=I=-16[mus];{delays}{popmix};"
             f"[mus][pops]amix=inputs=2:normalize=0,atrim=0:{dur},loudnorm=I=-14:TP=-1.5:LRA=11[a]"),
        ('-nomusic', f"{delays}{popmix};[pops]apad,atrim=0:{dur},loudnorm=I=-20:TP=-1.5[a]"),
    ):
        subprocess.run([FF, '-y', '-loglevel', 'error', *map(str, inputs), '-filter_complex', graph,
                        '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100',
                        '-movflags', '+faststart', str(here / 'out' / f'{name}{suffix}.mp4')], check=True)
    print(f'{name}: {dur:.1f}s, {len(pops)} pops -> out/{name}.mp4 + out/{name}-nomusic.mp4')


if __name__ == '__main__':
    main()
