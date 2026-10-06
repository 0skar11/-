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
    'win': {'file': 'song2.wav', 'bpm': 74.25, 'drop': 4.615, 'slam': 22.315, 'len': 35.4},
    # The user's third sound ("BUT IF THERE IS ONE THING I CAN DO FOR THEM / FOR THE / IT IS / WIN"), 25.15s:
    # the words build over a beat up to a short dip at 7.5-8.0, the drop on "WIN" at 8.11, then steady to
    # ~24.5. 112.2 BPM (0.535s beat). No second drop, so no slam.
    'win2': {'file': 'song3.wav', 'bpm': 112.2, 'drop': 8.11, 'slam': None, 'len': 25.15},
}
SONG = SONGS['win2']
BEAT = 60 / SONG['bpm']
SNAP = BEAT                          # kills snap to beats
MUSIC_DROP, MUSIC_SLAM = SONG['drop'], SONG['slam']
HOOK = MUSIC_DROP                    # the whole song plays: the intro (4-square grid) runs to the first drop
MUSIC_START = 0.0                    # music second at output 0
SLAM = MUSIC_SLAM and MUSIC_SLAM - MUSIC_START   # output second of a second drop after a silent break, if any
SONG_LEN = SONG['len'] - MUSIC_START             # output second where the song ends
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
TITLES = []   # no titles over the gameplay (was: ('clip1', 12.20, 'clutch'))

# After the intro: (clip, src in, src out[, anchor]): tight cuts around the kills (no deaths, no walking
# around) — the clutch, clips 3, 7 and 6, clip4's ace and clip2's ace to close. An anchored cut puts its
# first kill at that output second; the cut before it stretches or shrinks to meet it. Everything has to
# fit before the song ends (the intro already shows clips 2, 8, 9 and 5).
CUTS = [
    ('clip1', 7.90, 9.50), ('clip1', 11.10, 12.70),
    ('clip3', 9.60, 10.50), ('clip3', 13.90, 14.60),
    ('clip7', 9.10, 10.10), ('clip7', 27.30, 28.50),
    ('clip6', 4.70, 7.10),
    ('clip4', 15.40, 16.00), ('clip4', 17.30, 18.60),
    ('clip2', 18.10, 21.40),
]

# The intro: four squares, each popping in on a word of the song's intro (vocal onsets "BUT" 0.06,
# "IF" 1.71, "ONE" 3.43, "FOR THE" 5.43s) and playing its own kills; on "IT IS" (7.53s) they all punch,
# and on the drop ("WIN") they fly out to the corners over the first full-screen cut.
# (appear at, clip, src second at appear), in reading order: top-left, top-right, bottom-left, bottom-right.
TILES = [(0.06, 'clip2', 14.00), (1.71, 'clip8', 14.50), (3.43, 'clip9', 3.90), (5.43, 'clip5', 9.90)]
TILE_IN, TILE_OUT, TILE_PUNCH = 0.3, 0.35, 7.53
HOOK_CUT = (TILES[0][1], TILES[0][2] - TILES[0][0])   # under the grid (the post version's blurred backdrop)


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
    """The only text in the post version: CHAOS on top and LINK IN BIO under the gameplay, bigger at the end."""
    anton = lambda s: font('Anton-Regular.ttf', s)
    return {
        'brand': text_layer([('CHAOS', anton(150), (255, 255, 255, 255), 270),
                             ('LINK IN BIO', anton(76), (255, 70, 85, 255), 1610)], stroke=8),
        'end': text_layer([('CHAOS', anton(280), (255, 255, 255, 255), 860),
                           ('LINK IN BIO', anton(110), (255, 70, 85, 255), 1080)], stroke=12),
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


GRID = {}   # output frame index -> the four tile frames (None for a tile not on screen yet / any more)


def ease_out(x): return 1 - (1 - min(max(x, 0.0), 1.0)) ** 3


def draw_grid(canvas, t, rect, gap=10):
    """Draw the intro's four squares into rect=(x, y, w, h) of the canvas, with their fly-in/fly-out."""
    frames = GRID.get(int(round(t * FPS)))
    if not frames:
        return canvas
    x0, y0, w, h = rect
    cw, ch = (w - gap) // 2, (h - gap) // 2
    punch = 1.0 + 0.05 * decay(t, TILE_PUNCH, 0.3)
    for k, ((at, _, _), f) in enumerate(zip(TILES, frames)):
        if f is None:
            continue
        col, row = k % 2, k // 2
        dx, dy = (-1 if col == 0 else 1), (-1 if row == 0 else 1)
        p = ease_out((t - at) / TILE_IN)
        q = ease_out((t - HOOK) / TILE_OUT) if t >= HOOK else 0.0
        if q >= 1:
            continue
        scale = (0.55 + 0.45 * p) * punch
        # crop the source to the cell's aspect around the crosshair, then size it
        sw = min(1280, int(720 * cw / ch)); sh = min(720, int(1280 * ch / cw))
        tile = grade(cv2.resize(f[360 - sh // 2:360 + sh // 2, 640 - sw // 2:640 + sw // 2],
                                (max(2, int(cw * scale)), max(2, int(ch * scale))), interpolation=cv2.INTER_AREA))
        tile = cv2.copyMakeBorder(tile[3:-3, 3:-3], 3, 3, 3, 3, cv2.BORDER_CONSTANT, value=(85, 70, 255))
        th, tw = tile.shape[:2]
        cx = x0 + col * (cw + gap) + cw // 2 + int(dx * ((1 - p) * cw * 0.35 + q * cw * 1.3))
        cy = y0 + row * (ch + gap) + ch // 2 + int(dy * ((1 - p) * ch * 0.35 + q * ch * 1.3))
        tx, ty = cx - tw // 2, cy - th // 2
        a0x, a0y = max(tx, 0), max(ty, 0)
        a1x, a1y = min(tx + tw, canvas.shape[1]), min(ty + th, canvas.shape[0])
        if a1x <= a0x or a1y <= a0y:
            continue
        alpha = p * (1 - q)
        src = tile[a0y - ty:a1y - ty, a0x - tx:a1x - tx].astype(np.float32)
        dst = canvas[a0y:a1y, a0x:a1x].astype(np.float32)
        canvas[a0y:a1y, a0x:a1x] = (dst * (1 - alpha) + src * alpha).astype(np.uint8)
    return canvas


def compose_edit(t, frame, layers=None):
    """The plain version: full-frame 1920×1080 gameplay, a light zoom punch on kills, no text."""
    kick = sum(decay(t, k, 0.22) for k in KILL_OUT)
    zoom = 1.0 + 0.06 * kick
    rng = np.random.default_rng(int(t * FPS))
    sx, sy = (rng.uniform(-1, 1, 2) * 6 * kick).astype(int)
    cw, ch = 1280 / zoom, 720 / zoom
    x1 = min(max(int(640 + sx - cw / 2), 0), 1280 - int(cw)); y1 = min(max(int(360 + sy - ch / 2), 0), 720 - int(ch))
    if t < HOOK:   # the intro is only the four squares, on a dark backdrop
        out = np.full((1080, 1920, 3), 12, np.uint8)
    else:
        out = grade(cv2.resize(frame[y1:y1 + int(ch), x1:x1 + int(cw)], (1920, 1080), interpolation=cv2.INTER_CUBIC))
    out = draw_grid(out, t, (0, 0, 1920, 1080))
    fade = min(1.0, max(0.0, (t - END_AT) / 1.5))  # fade to black after the last ace
    return (out.astype(np.float32) * (1 - fade)).astype(np.uint8)


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
    if not hook:
        panel = grade(cv2.resize(frame[y1:y1 + int(ch), x1:x1 + int(cw)], (PANEL_W, PANEL_H), interpolation=cv2.INTER_CUBIC))
        out[PANEL_Y:PANEL_Y + PANEL_H] = panel
        if not ending:
            cv2.rectangle(out, (0, PANEL_Y), (W - 1, PANEL_Y + PANEL_H - 1), (85, 70, 255), 4)
    out = draw_grid(out, t, (0, PANEL_Y, PANEL_W, PANEL_H))

    if ending:
        e = min(1.0, (t - END_AT) / 0.35)
        out = (out.astype(np.float32) * (1 - 0.45 * e)).astype(np.uint8)
        out = over(out, layers['end'], e, scale=1.0 + 0.2 * (1 - e))
    else:
        out = over(out, layers['brand'])
        for at, name in TITLE_OUT:
            seg_end = segment_at(at)[1]
            if at <= t < seg_end:
                out = over(out, layers[name], min(1.0, (t - at) / 0.08), scale=1.0 + 0.3 * decay(t, at, 0.25))
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


def load_grid(indices):
    """Fill GRID for these output frame indices (each tile read in order from its own reader)."""
    for k, (at, clip, src) in enumerate(TILES):
        reader = Clip(V / f'{clip}.mp4')
        for i in sorted(indices):
            t = i / FPS
            if at <= t < HOOK + TILE_OUT:
                GRID.setdefault(i, [None] * len(TILES))[k] = reader.at(src + t - at)


VERSIONS = {  # name -> (compose, size, seconds after the last ace)
    'post': (compose, (W, H), 2.5),
    'edit': (compose_edit, (1920, 1080), 99),
}


def render(name, layers, clips):
    comp, (w, h), tail = VERSIONS[name]
    duration = min(END_AT + tail, SONG_LEN)  # never past the end of the song
    n = int(duration * FPS)
    load_grid(range(n))
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
              f'\nslam {SLAM}, last ace ends {END_AT:.2f}, song ends {SONG_LEN:.2f}')
        return
    names = [a for a in sys.argv[1:] if a in VERSIONS] or list(VERSIONS)
    layers = build_layers()
    clips = {k: Clip(V / f'{k}.mp4') for k in KILLS}
    if '--preview' in sys.argv:
        t = float(sys.argv[sys.argv.index('--preview') + 1])
        clip, s = source(t)
        load_grid([int(round(t * FPS))])
        cv2.imwrite(str(OUT / 'v11-preview.png'), VERSIONS[names[0]][0](t, clips[clip].at(s), layers))
        return
    for name in names:
        render(name, layers, clips)


if __name__ == '__main__':
    main()
