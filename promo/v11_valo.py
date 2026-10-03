"""v11: Valorant edit ("ايديت فالو") of four of ØSKAR's clips, cut to a phonk beat.

    python3 v11_valo.py                 # writes out/v11-valo.mp4 (and out/v11-valo-nomusic.mp4)
    python3 v11_valo.py --plan          # print the cut list (output times, kills on beats)
    python3 v11_valo.py --preview 4.5   # one frame at t=4.5s -> out/v11-preview.png

Inputs (gitignored): vo/v11/clip1..4.mp4 and vo/v11/phonk.mp3 (ElevenLabs music, 130 BPM, drop at
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

BEAT = 60 / 130.02
MUSIC_DROP, MUSIC_SLAM = 22.125, 44.28
HOOK = 1.0                           # the hook runs until the drop
MUSIC_START = MUSIC_DROP - HOOK      # music second at output 0
SLAM = MUSIC_SLAM - MUSIC_START      # output second of the slam back after the silent break
def on_beat(t): return HOOK + round((t - HOOK) / BEAT) * BEAT

KILLS = {   # source seconds
    'clip1': [8.30, 8.88, 9.20, 11.48],
    'clip2': [6.10, 7.80, 18.40, 19.30, 20.30],
    'clip3': [10.05, 12.30, 14.25],
    'clip4': [8.55, 13.10, 15.70, 17.75],
}
TITLES = [('clip1', 12.20, 'clutch'), ('clip4', 17.75, 'ace'), ('clip2', 20.30, 'ace')]

# (clip, src in, src out). The hook is the ace, in grey; then clutch, clip3, clip4's ace, clip2's ace.
CUTS = [
    ('clip1', 7.70, 9.70), ('clip1', 11.00, 12.95),
    ('clip3', 9.30, 10.90), ('clip3', 11.70, 12.90), ('clip3', 13.60, 14.90), ('clip3', 16.70, 17.90),
    ('clip4', 7.40, 9.40), ('clip4', 12.40, 13.80), ('clip4', 15.10, 16.30), ('clip4', 17.10, 19.40),
    ('clip2', 5.30, 6.70), ('clip2', 7.20, 8.40),
]
FINAL = ('clip2', 17.80, 22.00)      # its kill at 20.30 lands on the slam
FLEX = len(CUTS) - 1                 # this cut's out-point stretches/shrinks to meet FINAL


def plan():
    """-> list of (out start, out end, clip, src at out start), the hook first."""
    segs = [(0.0, HOOK, 'clip2', 20.20)]
    t = HOOK
    for clip, a, b in CUTS:
        kills = [k for k in KILLS[clip] if a <= k <= b]
        if kills:  # shift the in-point so the first kill lands on the nearest beat
            a = kills[0] - (on_beat(t + kills[0] - a) - t)
        segs.append([t, t + b - a, clip, a])
        t += b - a
    clip, a, b = FINAL
    start = SLAM - (20.30 - a)
    segs[FLEX + 1][1] = start                                   # stretch/shrink the cut before it
    segs.append((start, start + b - a, clip, a))
    return [tuple(s) for s in segs]


SEGS = plan()
END_AT = SEGS[-1][1]
DURATION = END_AT + 2.8


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
        'ace': text_layer([('ACE', anton(340), (255, 210, 60, 255), PANEL_Y + PANEL_H // 2)], stroke=14),
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


def compose(t, frame, layers):
    """frame: the 1280×720 BGR source frame for output time t."""
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
    flash = max([0.3 * decay(t, k, 0.1) for k in KILL_OUT] + [0.35 * decay(t, c, 0.1) for c in (HOOK, END_AT)])
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


def main():
    if '--plan' in sys.argv:
        for s0, s1, clip, a in SEGS:
            print(f'{s0:6.2f}-{s1:6.2f}  {clip}  src {a:6.2f}-{a + s1 - s0:6.2f}')
        print('kills', [round(k, 2) for k in KILL_OUT], '\ntitles', [(round(t, 2), n) for t, n in TITLE_OUT],
              f'\nslam {SLAM:.2f}, end card {END_AT:.2f}-{DURATION:.2f}')
        return
    layers = build_layers()
    clips = {k: Clip(V / f'{k}.mp4') for k in KILLS}
    if '--preview' in sys.argv:
        t = float(sys.argv[sys.argv.index('--preview') + 1])
        clip, s = source(t)
        cv2.imwrite(str(OUT / 'v11-preview.png'), compose(t, clips[clip].at(s), layers))
        return
    # Decode in source order (grouped per clip), keep the composited frames as JPEG, then write in order.
    n = int(DURATION * FPS)
    reqs = [(*source(i / FPS), i) for i in range(n)]
    done = {}
    for clip, s, i in sorted(reqs, key=lambda r: (r[0], r[1])):
        done[i] = cv2.imencode('.jpg', compose(i / FPS, clips[clip].at(s), layers), [cv2.IMWRITE_JPEG_QUALITY, 95])[1]
    video = OUT / 'v11-valo.video.mp4'
    ff = subprocess.Popen([FF, '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'mjpeg', '-i', '-',
                           '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', str(video)],
                          stdin=subprocess.PIPE)
    for i in range(n):
        ff.stdin.write(done[i].tobytes())
    ff.stdin.close(); ff.wait()
    fade = DURATION - 0.9
    subprocess.run([FF, '-y', '-loglevel', 'error', '-i', str(video), '-ss', str(MUSIC_START), '-t', str(DURATION), '-i', str(V / 'phonk.mp3'),
                    '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                    '-af', f'afade=t=out:st={fade}:d=0.9,loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '44100', '-c:a', 'aac', '-b:a', '192k',
                    '-shortest', '-movflags', '+faststart', str(OUT / 'v11-valo.mp4')], check=True)
    subprocess.run([FF, '-y', '-loglevel', 'error', '-i', str(video), '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-map', '0:v', '-map', '1:a',
                    '-c:v', 'copy', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', str(OUT / 'v11-valo-nomusic.mp4')], check=True)
    print('-> out/v11-valo.mp4, out/v11-valo-nomusic.mp4')


if __name__ == '__main__':
    main()
