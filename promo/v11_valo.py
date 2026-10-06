"""v11: Valorant edit ("ايديت فالو") of six of ØSKAR's clips, cut to a phonk beat, in two versions:

  post  out/v11-valo-post.mp4   1080×1920 for TikTok: hook text, ØSKAR / CHAOS titles, CLUTCH, CHAOS end card
  edit  out/v11-valo-edit.mp4   1920×1080 plain edit: full-frame gameplay and the beat, no text

    python3 v11_valo.py [post|edit]          # both when no version is given
    python3 v11_valo.py --plan               # print the cut list (output times, kills on beats)
    python3 v11_valo.py post --preview 4.5   # one frame at t=4.5s -> out/v11-preview.png

Inputs (gitignored): vo/v11/clip1..6.mp4 and vo/v11/phonk.mp3 (ElevenLabs music, 130 BPM, drop at
22.125s, a silent break at 43.35-43.75s and the slam back at 44.28s).

Everything plays at normal speed: the dead time is cut out, not sped up. Each cut's in-point is nudged
(by less than half a beat) so the first kill after it lands on a beat, and the last cut is placed so
the final kill of the ace hits the slam after the beat's silent break. Kill times (source seconds)
were found from the kill banner popping under the crosshair.
"""
import subprocess
import sys
from pathlib import Path

import cv2
import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont

here = Path(__file__).parent
V = here / 'vo' / 'v11'
OUT = here / 'out'
FF = imageio_ffmpeg.get_ffmpeg_exe()
W, H, FPS = 1080, 1920, 30

# Songs (files in vo/v11, gitignored), measured from their onsets: tempo, the drop, and the hit right
# after a silent break (the slam), where the final kill goes.
SONGS = {
    # ElevenLabs phonk: drop at 22.125, silent break 43.35-43.75, slam at 44.28.
    'phonk': {'file': 'phonk.mp3', 'bpm': 130.02, 'drop': 22.125, 'slam': 44.28},
    # The user's TikTok sound ("... to WIN / WINNING / I DREAM / BLOOD / REGRET / GUILTY / SACRIFICE MYSELF"),
    # 35.4s: quiet intro, first drop on "WIN" at 4.615, build from ~17s, silence 21.0-21.5, second drop
    # on "WIN" at 22.315, full energy to ~34.4. 74.25 BPM (0.808s beat; half beats work for fast cuts).
    'win': {'file': 'song2.wav', 'bpm': 74.25, 'drop': 4.615, 'slam': 22.315},
}
SONG = SONGS['win']
BEAT = 60 / SONG['bpm']
SNAP = BEAT / 2                      # kills snap to half beats (the song's hi-hats/claps run at that rate)
MUSIC_DROP, MUSIC_SLAM = SONG['drop'], SONG['slam']
HOOK = 3.0                           # the hook runs until the first drop ("... them to WIN")
MUSIC_START = MUSIC_DROP - HOOK      # music second at output 0
SLAM = MUSIC_SLAM - MUSIC_START      # output second of the second drop, after the silent break
SONG_LEN = 35.4 - MUSIC_START        # output second where the song ends
def on_beat(t): return HOOK + round((t - HOOK) / SNAP) * SNAP

KILLS = {   # source seconds
    'clip1': [8.30, 8.88, 9.20, 11.48],
    'clip2': [6.10, 7.80, 18.40, 19.30, 20.30],
    'clip3': [10.05, 12.30, 14.25],
    'clip4': [8.55, 13.10, 15.70, 17.75],
    'clip5': [10.60, 11.50, 13.45, 14.95],
    'clip6': [4.92, 5.76, 6.84],
    'clip7': [9.58, 14.02, 27.72],   # clips 7-9 are Medal exports (852×480, 640×360, 960×720),
    'clip8': [11.95, 13.00, 17.00, 18.20, 20.00],   # rescaled to 1280×720 into vo/v11/
    'clip9': [5.90, 7.10],
}
TITLES = [('clip1', 12.20, 'clutch')]

# The hook (in grey) is clip2's ace. Then (clip, src in, src out[, anchor]): tight cuts around the kills
# (no deaths, no walking around), clip4's ace with its last kill on the second drop, then clips 8 and 6,
# and clip2's ace to close. An anchored cut puts its first kill at that output second; the cut before it
# stretches or shrinks to meet it. The song is 35.4s, so everything has to fit before its end.
HOOK_CUT = ('clip2', 18.20)
CUTS = [
    ('clip1', 7.90, 9.50), ('clip1', 11.10, 12.70),
    ('clip3', 9.60, 10.50), ('clip3', 12.00, 12.70), ('clip3', 13.90, 14.60),
    ('clip5', 10.30, 11.90), ('clip5', 13.10, 13.80), ('clip5', 14.70, 15.50),
    ('clip9', 5.50, 7.60),
    ('clip7', 9.10, 10.10), ('clip7', 13.60, 14.40), ('clip7', 27.30, 28.50),
    ('clip8', 11.50, 13.40),
    ('clip4', 8.10, 9.00), ('clip4', 15.40, 16.00), ('clip4', 17.30, 19.00, SLAM),
    ('clip8', 16.80, 20.30),
    ('clip6', 4.70, 7.10),
    ('clip2', 18.10, 21.60),
]


def plan():
    """-> list of (out start, out end, clip, src at out start), the hook first."""
    segs = [[0.0, HOOK, HOOK_CUT[0], HOOK_CUT[1]]]
    t = HOOK
    for clip, a, b, *anchor in CUTS:
        kills = [k for k in KILLS[clip] if a <= k <= b]
        if anchor:   # pin the first kill to the anchor; the previous cut absorbs the difference
            t = anchor[0] - (kills[0] - a)
            segs[-1][1] = t
        elif kills:  # shift the in-point so the first kill lands on the nearest half beat
            a = kills[0] - (on_beat(t + kills[0] - a) - t)
        segs.append([t, t + b - a, clip, a])
        t += b - a
    return [tuple(s) for s in segs]


SEGS = plan()
END_AT = SEGS[-1][1]


def segment_at(t):
    for s in SEGS:
        if t < s[1]:
            return s
    return SEGS[-1]


def out_times(clip, src):
    return [s0 + src - a for s0, s1, c, a in SEGS[1:] if c == clip and s0 <= s0 + src - a < s1]


KILL_OUT = sorted(t for c, ks in KILLS.items() for k in ks for t in out_times(c, k))
TITLE_OUT = [(t, name) for c, src, name in TITLES for t in out_times(c, src)]
CUT_OUT = [s[0] for s in SEGS[1:]] + [END_AT]

# Gameplay panel: a 810×720 crop around the crosshair, scaled to 1080×960, in the middle of the frame.
CROP_W, CROP_H = 810, 720
PANEL_Y = 470
PANEL_W, PANEL_H = 1080, 960

FONTS = here / 'fonts'
def font(name, size): return ImageFont.truetype(str(FONTS / name), size)


def text_layer(lines, stroke=10):
    """lines: [(text, font, fill, y)] -> RGBA full-frame layer (PIL does the Arabic shaping via raqm)."""
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for text, f, fill, y in lines:
        d.text((W // 2, y), text, font=f, fill=fill, anchor='mm', stroke_width=stroke, stroke_fill=(0, 0, 0, 255))
    return np.array(im)


def build_layers():
    anton = lambda s: font('Anton-Regular.ttf', s)
    lal = lambda s: font('Lalezar-Regular.ttf', s)
    return {
        'hook': text_layer([('استنى للآخر', lal(120), (255, 255, 255, 255), 300),
                            ('اللي هيحصل مش طبيعي', lal(80), (255, 210, 60, 255), 1600)]),
        'title': text_layer([('ØSKAR', anton(130), (255, 255, 255, 255), 250),
                             ('CHAOS  •  VALORANT', anton(46), (255, 70, 85, 255), 360),
                             ('CHAOS ON TOP', anton(90), (255, 255, 255, 230), 1600)], stroke=6),
        'clutch': text_layer([('CLUTCH', anton(230), (255, 255, 255, 255), PANEL_Y + PANEL_H // 2)], stroke=12),
        'end': text_layer([('CHAOS', anton(260), (255, 255, 255, 255), 700),
                           ('عايز تلعب فالو مع ناس جامدة؟', lal(78), (255, 255, 255, 255), 960),
                           ('تعالى CHAOS', lal(110), (255, 70, 85, 255), 1110),
                           ('لينك الديسكورد في البايو', lal(66), (255, 210, 60, 255), 1400)]),
    }


def decay(t, at, length):
    """1 right at `at`, falling to 0 over `length` seconds (0 before `at`)."""
    x = (t - at) / length
    return 0.0 if x < 0 or x > 1 else (1 - x) ** 2


def grade(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[..., 1] = np.clip(hsv[..., 1] * 1.15, 0, 255)
    img = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR).astype(np.float32)
    return np.clip((img - 128) * 1.05 + 126, 0, 255).astype(np.uint8)


def over(base, layer, alpha=1.0, scale=1.0):
    """Alpha-blend an RGBA full-frame layer onto the BGR frame (scaled around its own center)."""
    if alpha <= 0:
        return base
    if scale != 1.0:
        M = cv2.getRotationMatrix2D((W / 2, (layer[..., 3] > 0).any(1).nonzero()[0].mean()), 0, scale)
        layer = cv2.warpAffine(layer, M, (W, H))
    a = layer[..., 3:4].astype(np.float32) / 255 * alpha
    rgb = layer[..., 2::-1].astype(np.float32)
    return (base * (1 - a) + rgb * a).astype(np.uint8)


def compose_edit(t, frame, layers=None):
    """The plain version: full-frame 1920×1080 gameplay, a light zoom punch on kills, no text."""
    kick = sum(decay(t, k, 0.22) for k in KILL_OUT)
    zoom = 1.0 + 0.06 * kick
    rng = np.random.default_rng(int(t * FPS))
    sx, sy = (rng.uniform(-1, 1, 2) * 6 * kick).astype(int)
    cw, ch = 1280 / zoom, 720 / zoom
    x1 = min(max(int(640 + sx - cw / 2), 0), 1280 - int(cw)); y1 = min(max(int(360 + sy - ch / 2), 0), 720 - int(ch))
    out = grade(cv2.resize(frame[y1:y1 + int(ch), x1:x1 + int(cw)], (1920, 1080), interpolation=cv2.INTER_CUBIC))
    if t < HOOK:
        out = cv2.cvtColor(cv2.cvtColor(out, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
    flash = max([0.25 * decay(t, k, 0.1) for k in KILL_OUT] + [0.35 * decay(t, c, 0.1) for c in (HOOK, SLAM)])
    fade = min(1.0, max(0.0, (t - END_AT) / 1.0))  # fade to black after the last ace
    out = out.astype(np.float32) * (1 - flash) + 255 * flash
    return (out * (1 - fade)).astype(np.uint8)


def compose(t, frame, layers):
    """The post version. frame: the 1280×720 BGR source frame for output time t."""
    hook, ending = t < HOOK, t >= END_AT
    kick = sum(decay(t, k, 0.22) for k in KILL_OUT)
    zoom = 1.0 + 0.07 * kick
    shake = 8 * kick
    rng = np.random.default_rng(int(t * FPS))
    sx, sy = (rng.uniform(-1, 1, 2) * shake).astype(int)

    # Background: the same frame, blown up, blurred and darkened.
    small = cv2.resize(frame, (96, 54), interpolation=cv2.INTER_AREA)
    bg = cv2.resize(small, (int(H * 16 / 9), H), interpolation=cv2.INTER_LINEAR)
    x0 = (bg.shape[1] - W) // 2
    bg = cv2.GaussianBlur(bg[:, x0:x0 + W], (0, 0), 18)
    out = (bg.astype(np.float32) * 0.42).astype(np.uint8)

    # Gameplay panel with a light zoom punch + shake on kills.
    cw, ch = CROP_W / zoom, CROP_H / zoom
    x1 = min(max(int(640 + sx - cw / 2), 0), 1280 - int(cw)); y1 = min(max(int(360 + sy - ch / 2), 0), 720 - int(ch))
    panel = grade(cv2.resize(frame[y1:y1 + int(ch), x1:x1 + int(cw)], (PANEL_W, PANEL_H), interpolation=cv2.INTER_CUBIC))
    if hook:
        panel = cv2.cvtColor(cv2.cvtColor(panel, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
    out[PANEL_Y:PANEL_Y + PANEL_H] = panel
    if not hook and not ending:
        cv2.rectangle(out, (0, PANEL_Y), (W - 1, PANEL_Y + PANEL_H - 1), (85, 70, 255), 4)

    if ending:
        e = min(1.0, (t - END_AT) / 0.35)
        out = (out.astype(np.float32) * (1 - 0.45 * e)).astype(np.uint8)
        out = over(out, layers['end'], e, scale=1.0 + 0.2 * (1 - e))
    elif hook:
        out = over(out, layers['hook'], min(1.0, t / 0.15))
    else:
        out = over(out, layers['title'])
        for at, name in TITLE_OUT:
            seg_end = segment_at(at)[1]
            if at <= t < seg_end:
                out = over(out, layers[name], min(1.0, (t - at) / 0.08), scale=1.0 + 0.3 * decay(t, at, 0.25))

    # A soft white flash on kills and on the bigger cuts.
    flash = max([0.3 * decay(t, k, 0.1) for k in KILL_OUT] + [0.35 * decay(t, c, 0.1) for c in (HOOK, SLAM, END_AT)])
    if flash > 0:
        out = (out.astype(np.float32) * (1 - flash) + 255 * flash).astype(np.uint8)
    return out


class Clip:
    """Sequential reader with a small cache, since the requests per clip are ascending."""
    def __init__(self, path):
        self.path = path
        cap = cv2.VideoCapture(str(path))
        self.fps = cap.get(cv2.CAP_PROP_FPS)
        cap.release()
        self.cap, self.idx, self.cache = None, -1, {}

    def get(self, i):
        if i in self.cache:
            return self.cache[i]
        if self.cap is None or i < self.idx:
            self.cap = cv2.VideoCapture(str(self.path)); self.idx = -1; self.cache = {}
        while self.idx < i:
            ok, f = self.cap.read()
            if not ok:
                break
            self.idx += 1
            self.cache[self.idx] = f
            for k in [k for k in self.cache if k < self.idx - 3]:
                del self.cache[k]
        return self.cache.get(i, self.cache[max(self.cache)])

    def at(self, s):
        return self.get(int(round(s * self.fps)))


def source(t):
    s0, _, clip, a = segment_at(min(t, END_AT - 1e-3))
    return clip, a + min(t, END_AT - 1e-3) - s0


VERSIONS = {  # name -> (compose, size, seconds after the last ace)
    'post': (compose, (W, H), 2.5),
    'edit': (compose_edit, (1920, 1080), 1.2),
}


def render(name, layers, clips):
    comp, (w, h), tail = VERSIONS[name]
    duration = min(END_AT + tail, SONG_LEN)  # never past the end of the song
    n = int(duration * FPS)
    # Decode in source order (grouped per clip), keep the composited frames as JPEG, then write in order.
    done = {}
    for clip, s, i in sorted(((*source(i / FPS), i) for i in range(n)), key=lambda r: (r[0], r[1])):
        done[i] = cv2.imencode('.jpg', comp(i / FPS, clips[clip].at(s), layers), [cv2.IMWRITE_JPEG_QUALITY, 95])[1]
    video = OUT / f'v11-valo-{name}.video.mp4'
    ff = subprocess.Popen([FF, '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'mjpeg', '-i', '-',
                           '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', str(video)],
                          stdin=subprocess.PIPE)
    for i in range(n):
        ff.stdin.write(done[i].tobytes())
    ff.stdin.close(); ff.wait()
    fade = duration - 1.0
    subprocess.run([FF, '-y', '-loglevel', 'error', '-i', str(video), '-ss', str(MUSIC_START), '-t', str(duration), '-i', str(V / SONG['file']),
                    '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                    '-af', f'afade=t=out:st={fade}:d=1.0,loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '44100', '-c:a', 'aac', '-b:a', '192k',
                    '-shortest', '-movflags', '+faststart', str(OUT / f'v11-valo-{name}.mp4')], check=True)
    print(f'-> out/v11-valo-{name}.mp4 ({duration:.1f}s)')


def main():
    if '--plan' in sys.argv:
        for s0, s1, clip, a in SEGS:
            print(f'{s0:6.2f}-{s1:6.2f}  {clip}  src {a:6.2f}-{a + s1 - s0:6.2f}')
        print('kills', [round(k, 2) for k in KILL_OUT], '\ntitles', [(round(t, 2), n) for t, n in TITLE_OUT],
              f'\nslam {SLAM:.2f}, last ace ends {END_AT:.2f}')
        return
    names = [a for a in sys.argv[1:] if a in VERSIONS] or list(VERSIONS)
    layers = build_layers()
    clips = {k: Clip(V / f'{k}.mp4') for k in KILLS}
    if '--preview' in sys.argv:
        t = float(sys.argv[sys.argv.index('--preview') + 1])
        clip, s = source(t)
        cv2.imwrite(str(OUT / 'v11-preview.png'), VERSIONS[names[0]][0](t, clips[clip].at(s), layers))
        return
    for name in names:
        render(name, layers, clips)


if __name__ == '__main__':
    main()
