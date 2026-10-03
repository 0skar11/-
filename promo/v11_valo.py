"""v11: Valorant edit ("ايديت فالو") of two of ØSKAR's clips, cut to a phonk beat.

    python3 v11_valo.py                 # writes out/v11-valo.mp4 (and out/v11-valo-nomusic.mp4)
    python3 v11_valo.py --preview 4.5   # one frame at t=4.5s -> out/v11-preview.png

Inputs (gitignored): vo/v11/clip1.mp4 (clutch), vo/v11/clip2.mp4 (ace), vo/v11/phonk.mp3 (ElevenLabs
music, 130 BPM, drop at 22.125s, a silent break at 43.35-43.75s and the slam back at 44.28s).

Each clip plays through a time map: (output second, source second) keyframes, linear in between.
The keyframes pin every kill onto a beat, so the speed ramps fall out of the map by themselves. Kill
frames were found from the kill banner popping under the crosshair.
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

MUSIC_START = 20.125          # music second at output 0, so the drop (22.125) lands at 2.0
BEAT = 60 / 130.02
def beat(k): return 2.0 + k * BEAT

# (clip, [(out, src), ...]) — consecutive segments; the first is the hook (the ACE, slowed, in grey).
SEGMENTS = [
    ('clip2', [(0.0, 19.85), (2.0, 20.85)]),
    ('clip1', [(2.0, 7.20), (beat(2), 8.30), (beat(3), 8.88), (beat(4), 9.20), (beat(8), 11.48),
               (beat(11), 12.20), (beat(13), 12.90)]),
    ('clip2', [(beat(13), 5.40), (beat(15), 6.10), (beat(19), 7.80), (beat(23), 9.70), (beat(27), 12.30),
               (beat(31), 14.80), (beat(41), 18.40), (beat(44), 19.30), (23.225, 20.20), (beat(48), 20.30),
               (beat(49), 20.67), (26.0, 22.05)]),
]
KILLS = [beat(2), beat(3), beat(4), beat(8), beat(15), beat(19), beat(41), beat(44), beat(48)]
CLUTCH_AT, ACE_AT = beat(11), beat(48)
SILENCE = (23.225, beat(48))  # the beat drops out here: everything freezes and zooms in
END_AT, DURATION = 26.0, 29.5

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
        'clutch': text_layer([('CLUTCH', anton(250), (255, 255, 255, 255), PANEL_Y + PANEL_H // 2)], stroke=14),
        'ace': text_layer([('ACE', anton(380), (255, 210, 60, 255), PANEL_Y + PANEL_H // 2)], stroke=16),
        'end': text_layer([('CHAOS', anton(260), (255, 255, 255, 255), 700),
                           ('عايز تلعب فالو مع ناس جامدة؟', lal(78), (255, 255, 255, 255), 960),
                           ('تعالى CHAOS', lal(110), (255, 70, 85, 255), 1110),
                           ('لينك الديسكورد في البايو', lal(66), (255, 210, 60, 255), 1400)]),
    }


def src_time(points, t):
    xs, ys = zip(*points)
    return float(np.interp(t, xs, ys))


def segment_at(t):
    for i, (clip, pts) in enumerate(SEGMENTS):
        if t < pts[-1][0] or i == len(SEGMENTS) - 1:
            return i, clip, pts
    raise ValueError(t)


def speed_at(pts, t, dt=1 / FPS):
    return (src_time(pts, t + dt) - src_time(pts, t)) / dt


def decay(t, at, length):
    """1 right at `at`, falling to 0 over `length` seconds (0 before `at`)."""
    x = (t - at) / length
    return 0.0 if x < 0 or x > 1 else (1 - x) ** 2


def grade(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[..., 1] = np.clip(hsv[..., 1] * 1.25, 0, 255)
    img = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR).astype(np.float32)
    return np.clip((img - 128) * 1.08 + 124, 0, 255).astype(np.uint8)


def rgb_split(img, px):
    if px < 1:
        return img
    out = img.copy()
    out[..., 2] = np.roll(img[..., 2], px, axis=1)
    out[..., 0] = np.roll(img[..., 0], -px, axis=1)
    return out


def over(base, layer, alpha=1.0, dx=0, dy=0, scale=1.0):
    """Alpha-blend an RGBA full-frame layer onto the BGR frame."""
    if alpha <= 0:
        return base
    if scale != 1.0:
        M = cv2.getRotationMatrix2D((W / 2, (layer[..., 3] > 0).any(1).nonzero()[0].mean()), 0, scale)
        M[0, 2] += dx; M[1, 2] += dy
        layer = cv2.warpAffine(layer, M, (W, H))
    elif dx or dy:
        layer = np.roll(layer, (dy, dx), axis=(0, 1))
    a = layer[..., 3:4].astype(np.float32) / 255 * alpha
    rgb = layer[..., 2::-1].astype(np.float32)
    return (base * (1 - a) + rgb * a).astype(np.uint8)


def compose(t, frame, layers, last_frame=None):
    """frame: the 1280×720 BGR source frame for output time t."""
    _, clip, pts = segment_at(t)
    hook = t < 2.0
    ending = t >= END_AT
    if ending:
        frame = last_frame

    kick = sum(decay(t, k, 0.28) for k in KILLS)
    on_beat = 0.0 if hook or ending else decay(t, beat(round((t - 2.0) / BEAT)), 0.18) * 0.35
    zoom = 1.0 + 0.16 * kick + 0.04 * on_beat
    if SILENCE[0] <= t < SILENCE[1]:  # slow push-in through the silent break
        zoom += 0.35 * (t - SILENCE[0]) / (SILENCE[1] - SILENCE[0])
    shake = 26 * kick
    rng = np.random.default_rng(int(t * FPS))
    sx, sy = (rng.uniform(-1, 1, 2) * shake).astype(int)

    # Background: the same frame, blown up, blurred and darkened.
    small = cv2.resize(frame, (96, 54), interpolation=cv2.INTER_AREA)
    bg = cv2.resize(small, (int(H * 16 / 9), H), interpolation=cv2.INTER_LINEAR)
    x0 = (bg.shape[1] - W) // 2
    bg = cv2.GaussianBlur(bg[:, x0:x0 + W], (0, 0), 18)
    out = (bg.astype(np.float32) * 0.42).astype(np.uint8)

    # Gameplay panel with zoom punch + shake.
    cw, ch = CROP_W / zoom, CROP_H / zoom
    cx, cy = 640 + sx * 0.3, 360 + sy * 0.3
    x1, y1 = int(cx - cw / 2), int(cy - ch / 2)
    x1 = min(max(x1, 0), 1280 - int(cw)); y1 = min(max(y1, 0), 720 - int(ch))
    panel = cv2.resize(frame[y1:y1 + int(ch), x1:x1 + int(cw)], (PANEL_W, PANEL_H), interpolation=cv2.INTER_CUBIC)
    panel = grade(panel)
    panel = rgb_split(panel, int(14 * kick))
    if hook or SILENCE[0] <= t < SILENCE[1]:
        grey = cv2.cvtColor(cv2.cvtColor(panel, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
        panel = grey if hook else cv2.addWeighted(panel, 0.35, grey, 0.65, 0)
    py = PANEL_Y + sy
    out[max(py, 0):py + PANEL_H, :] = panel[max(0, -py):PANEL_H - max(0, py + PANEL_H - H), :]
    if not hook and not ending:
        cv2.rectangle(out, (0, py), (W - 1, py + PANEL_H - 1), (85, 70, 255), 4)

    if ending:
        e = min(1.0, (t - END_AT) / 0.35)
        out = (out.astype(np.float32) * (1 - 0.45 * e)).astype(np.uint8)
        out = over(out, layers['end'], e, scale=1.0 + 0.25 * (1 - e) + 0.03 * decay(t, beat(round((t - 2) / BEAT)), 0.2))
    elif hook:
        out = over(out, layers['hook'], min(1.0, t / 0.2))
    else:
        out = over(out, layers['title'])
        if CLUTCH_AT <= t < SEGMENTS[1][1][-1][0]:
            k = decay(t, CLUTCH_AT, 0.25)
            out = over(out, layers['clutch'], 1.0, dx=int(rng.uniform(-8, 8) * (1 + 3 * k)), scale=1.0 + 0.6 * k)
        if ACE_AT <= t < END_AT:
            k = decay(t, ACE_AT, 0.3)
            out = over(out, layers['ace'], min(1.0, (t - ACE_AT) / 0.08), scale=1.0 + 0.8 * k)

    # White flash on kills and on the cuts.
    flash = max(0.55 * decay(t, k, 0.14) for k in KILLS + [2.0, SEGMENTS[2][1][0][0], END_AT])
    if flash > 0:
        out = (out.astype(np.float32) * (1 - flash) + 255 * flash).astype(np.uint8)
    return out


class Clip:
    """Sequential reader with a small cache, since the requests per clip are mostly ascending."""
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
        frame = None
        while self.idx < i:
            ok, f = self.cap.read()
            if not ok:
                break
            self.idx += 1; frame = f
            self.cache[self.idx] = f
            for k in [k for k in self.cache if k < self.idx - 3]:
                del self.cache[k]
        return self.cache.get(i, frame if frame is not None else self.cache[max(self.cache)])

    def at(self, s, blend):
        x = s * self.fps
        i = int(x)
        if not blend:
            return self.get(int(round(x)))
        a, b = self.get(i), self.get(i + 1)
        return cv2.addWeighted(a, 1 - (x - i), b, x - i, 0)


def main():
    layers = build_layers()
    clips = {k: Clip(V / f'{k}.mp4') for k in ('clip1', 'clip2')}
    last = clips['clip2'].at(SEGMENTS[-1][1][-1][1], False)
    if '--preview' in sys.argv:
        t = float(sys.argv[sys.argv.index('--preview') + 1])
        _, clip, pts = segment_at(t)
        f = clips[clip].at(src_time(pts, t), True)
        cv2.imwrite(str(OUT / 'v11-preview.png'), compose(t, f, layers, last))
        return
    # Decode in source order (grouped per clip), keep the composited frames as JPEG, then write in order.
    n = int(DURATION * FPS)
    reqs = []
    for i in range(n):
        t = i / FPS
        if t >= END_AT:
            continue
        _, clip, pts = segment_at(t)
        reqs.append((clip, src_time(pts, t), i, abs(speed_at(pts, t)) < 0.8))
    done = {}
    for clip, s, i, blend in sorted(reqs, key=lambda r: (r[0], r[1])):
        done[i] = cv2.imencode('.jpg', compose(i / FPS, clips[clip].at(s, blend), layers, last), [cv2.IMWRITE_JPEG_QUALITY, 95])[1]
    video = OUT / 'v11-valo.video.mp4'
    ff = subprocess.Popen([FF, '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'mjpeg', '-i', '-',
                           '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', str(video)],
                          stdin=subprocess.PIPE)
    for i in range(n):
        ff.stdin.write(done[i].tobytes() if i in done else cv2.imencode('.jpg', compose(i / FPS, last, layers, last))[1].tobytes())
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
