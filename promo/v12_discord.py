"""v12: "the CHAOS chat watches ØSKAR's stream" — a vertical TikTok video.

    python3 v12_discord.py            # -> out/v12-discord.mp4
    python3 v12_discord.py --plan     # print the cuts, kill times and the chat
    python3 v12_discord.py --preview 9.2

Top: the Valorant clips as a Discord "Go Live" stream tile (LIVE badge, oskar's name). Bottom: the CHAOS
#chat in Discord's dark theme, where the admins react to every kill ("X is typing..." first). The song is
the user's third sound (vo/v11/song3.wav, 112.2 BPM, drop on "WIN" at 8.11s), played in full; it ends on
CHAOS / LINK IN BIO.

The Discord UI is drawn by v12-ui.html (Chromium, for the Arabic + emoji text) into PNGs once by
v12_ui.mjs; this script composites those with the gameplay frame by frame. Clips, kill times and the
song are the ones v11_valo.py uses.
"""
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

import v11_valo as v11

here = Path(__file__).parent
OUT = here / 'out'
UI = here / 'vo' / 'v12'
FF, FPS, W, H = v11.FF, 30, 1080, 1920
SONG = v11.SONGS['win2']
BEAT, DROP = 60 / SONG['bpm'], SONG['drop']
SONG_LEN = SONG['len']

# Before the drop the stream just runs (clip2's opening kills); after it, tight cuts around kills.
INTRO = ('clip2', 4.40)
CUTS = [('clip1', 7.90, 9.50), ('clip1', 11.10, 12.70), ('clip5', 10.30, 11.90), ('clip9', 5.50, 7.60),
        ('clip8', 16.80, 20.30), ('clip2', 18.10, 21.40)]


def on_beat(t): return DROP + round((t - DROP) / BEAT) * BEAT


def plan():
    segs = [[0.0, DROP, *INTRO]]
    t = DROP
    for clip, a, b in CUTS:
        kills = [k for k in v11.KILLS[clip] if a <= k <= b]
        if kills:  # the first kill of each cut lands on a beat
            a = kills[0] - (on_beat(t + kills[0] - a) - t)
        segs.append([t, t + b - a, clip, a])
        t += b - a
    return segs


SEGS = plan()
END_AT = SEGS[-1][1]
KILL_OUT = sorted(s0 + k - a for s0, s1, c, a in SEGS for k in v11.KILLS[c] if s0 <= s0 + k - a < s1)

USERS = {  # display name, role color, default-avatar color
    'oskar': ('oskar', '#f47fff', '#eb459e'),
    'adam': ('adam', '#5fa8ff', '#5865f2'),
    'zatona': ('zatona', '#57f287', '#3ba55c'),
    'ali': ('ali', '#fee75c', '#faa61a'),
    'retlex': ('retlex', '#ff6b6b', '#ed4245'),
    '7assep': ('7assep', '#c9a7ff', '#757e8a'),
}
# (output second, author, text). Each lands just after the kill it reacts to (kills at 1.70, 3.40,
# 8.64, 9.22, 9.54, 10.25, 11.85, 12.75, 13.46, 14.66, 15.60, 16.80, 18.60, 19.34, 20.24, 21.24;
# CLUTCH banner at 11.0, ACE banner at 21.61).
CHAT = [
    (-2.0, '7assep', 'حد فاضي نلعب؟'),          # already in the chat when the video starts
    (-1.0, 'adam', 'انا جاي بعد الماتش ده'),
    (0.35, 'zatona', 'oskar فاتح ستريم 🔴 تعالوا بصوا'),
    (1.95, 'adam', 'ايه ده 👀'),
    (3.65, 'ali', 'اتنين ورا بعض؟'),
    (5.30, '7assep', '.'),
    (5.90, '7assep', '.'),
    (7.00, 'retlex', 'استنوا هو هيعمل حاجة'),
    (8.30, 'zatona', 'بدأ 💀'),
    (8.95, 'adam', 'هيدشووووت'),
    (9.80, 'ali', 'تلاتة؟؟؟'),
    (11.15, 'retlex', 'كلاتش يا جدعان 😭'),
    (12.05, '7assep', 'ازاااي'),
    (13.00, 'adam', 'ده مش طبيعي'),
    (13.70, 'zatona', '😭😭😭'),
    (14.90, 'ali', 'ده هاك ولا ايه 😂'),
    (15.85, 'retlex', '؟؟؟؟؟؟؟؟؟؟؟؟'),
    (17.05, 'adam', 'تاني؟؟'),
    (18.85, '7assep', 'حد يوقفه 💀'),
    (19.55, 'ali', '3'),
    (20.45, 'adam', '4'),
    (21.55, 'retlex', 'ACE ؟؟؟؟؟؟ 😭😭😭'),
    (22.15, 'zatona', 'W'),
    (22.45, '7assep', 'W'),
    (22.75, 'adam', 'W'),
    (23.05, 'ali', 'W W W'),
    (23.70, 'oskar', 'ez 😴'),
]
TYPING = 0.55   # "X is typing..." shows this long before each message

# Layout (px): the stream tile on top, the chat below.
TILE = (20, 40, 1040, 960)                 # x, y, w, h (rounded corners)
LIST_Y, LIST_H = 1130, 630                 # chat messages viewport
TYPE_Y = 1762                              # typing indicator row


def build_ui():
    """Write v12-ui.html's data and run v12_ui.mjs -> vo/v12/{bg,fg,list,typing_*}.png + list.json."""
    UI.mkdir(parents=True, exist_ok=True)
    data = {'users': USERS, 'chat': [{'t': t, 'who': w, 'text': x} for t, w, x in CHAT], 'tile': TILE,
            'list_y': LIST_Y, 'list_h': LIST_H, 'type_y': TYPE_Y}
    (UI / 'ui.json').write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    subprocess.run(['node', str(here / 'v12_ui.mjs')], check=True, cwd=here)


def load_ui():
    rd = lambda n: cv2.imread(str(UI / n), cv2.IMREAD_UNCHANGED)
    meta = json.loads((UI / 'list.json').read_text())
    return {'bg': rd('bg.png')[..., :3], 'fg': rd('fg.png'), 'list': rd('list.png')[..., :3], 'meta': meta,
            'typing': {k: rd(f'typing_{k}.png') for k in USERS}, 'end': v11.text_layer(
                [('CHAOS', v11.font('Anton-Regular.ttf', 230), (255, 255, 255, 255), TILE[1] + TILE[3] // 2 - 60),
                 ('LINK IN BIO', v11.font('Anton-Regular.ttf', 100), (255, 70, 85, 255), TILE[1] + TILE[3] // 2 + 120)],
                stroke=12)}


def paste_rgba(base, img, x, y, alpha=1.0):
    h, w = img.shape[:2]
    h, w = min(h, base.shape[0] - y), min(w, base.shape[1] - x)
    if h <= 0 or w <= 0:
        return
    a = img[:h, :w, 3:4].astype(np.float32) / 255 * alpha
    base[y:y + h, x:x + w] = (base[y:y + h, x:x + w] * (1 - a) + img[:h, :w, :3] * a).astype(np.uint8)


def round_mask(w, h, r):
    m = np.zeros((h, w), np.uint8)
    cv2.rectangle(m, (r, 0), (w - r, h), 255, -1); cv2.rectangle(m, (0, r), (w, h - r), 255, -1)
    for cx, cy in ((r, r), (w - r - 1, r), (r, h - r - 1), (w - r - 1, h - r - 1)):
        cv2.circle(m, (cx, cy), r, 255, -1, cv2.LINE_AA)
    return (m.astype(np.float32) / 255)[..., None]


MASK = round_mask(TILE[2], TILE[3], 26)


def compose(t, frame, ui):
    out = ui['bg'].copy()
    # the stream tile: gameplay cropped around the crosshair, light zoom punch on kills, frozen + dimmed at the end
    kick = sum(v11.decay(t, k, 0.22) for k in KILL_OUT)
    zoom = 1.0 + 0.05 * kick
    tw, th = TILE[2], TILE[3]
    ch = 720 / zoom; cw = ch * tw / th
    x1, y1 = int(640 - cw / 2), int(360 - ch / 2)
    tile = v11.grade(cv2.resize(frame[y1:y1 + int(ch), x1:x1 + int(cw)], (tw, th), interpolation=cv2.INTER_CUBIC))
    if t >= END_AT:
        tile = (tile * (1 - 0.55 * min(1.0, (t - END_AT) / 0.4))).astype(np.uint8)
    x, y = TILE[0], TILE[1]
    out[y:y + th, x:x + tw] = (out[y:y + th, x:x + tw] * (1 - MASK) + tile * MASK).astype(np.uint8)

    # the chat: the tall list, cropped so the newest visible message sits at the bottom of the viewport
    meta = ui['meta']
    shown = [i for i, (mt, _, _) in enumerate(CHAT) if t >= mt]
    if shown:
        k = shown[-1]
        p = v11.ease_out((t - CHAT[k][0]) / 0.18)
        prev = meta['bottoms'][k - 1] if k > 0 else 0
        bottom = prev + (meta['bottoms'][k] - prev) * p
        top = max(0, int(bottom) - LIST_H)
        crop = ui['list'][top:top + LIST_H]
        view = out[LIST_Y:LIST_Y + crop.shape[0]]
        view[:] = crop
        # fade in the newest message
        mt0 = meta['tops'][k] - top
        if 0 <= mt0 < LIST_H and p < 1:
            seg = view[mt0:]
            seg[:] = (seg * p + np.array(meta['bg'][::-1], np.float32) * (1 - p)).astype(np.uint8)
        # hide anything below the current bottom (later messages) — already cut by the crop height
        cut = int(bottom) - top
        if cut < LIST_H:
            view[cut:] = meta['bg'][::-1]

    # "X is typing..." for the next message
    nxt = next(((mt, who) for mt, who, _ in CHAT if mt - TYPING <= t < mt), None)
    if nxt:
        paste_rgba(out, ui['typing'][nxt[1]], 24, TYPE_Y)
    paste_rgba(out, ui['fg'], 0, 0)

    if t >= END_AT:
        out = v11.over(out, ui['end'], min(1.0, (t - END_AT) / 0.3), scale=1.0 + 0.15 * (1 - min(1.0, (t - END_AT) / 0.3)))
    return out


def source(t):
    t = min(t, END_AT - 1e-3)
    for s0, s1, clip, a in SEGS:
        if t < s1:
            return clip, a + t - s0
    s0, _, clip, a = SEGS[-1]
    return clip, a + t - s0


def main():
    if '--plan' in sys.argv:
        for s in SEGS:
            print(f'{s[0]:6.2f}-{s[1]:6.2f}  {s[2]}  src {s[3]:.2f}')
        print('kills', [round(k, 2) for k in KILL_OUT], f'\nend {END_AT:.2f}, song {SONG_LEN}')
        for c in CHAT:
            print(c)
        return
    if '--ui' in sys.argv or not (UI / 'list.json').exists():
        build_ui()
    ui = load_ui()
    clips = {k: v11.Clip(v11.V / f'{k}.mp4') for k in v11.KILLS}
    if '--preview' in sys.argv:
        t = float(sys.argv[sys.argv.index('--preview') + 1])
        clip, s = source(t)
        cv2.imwrite(str(OUT / 'v12-preview.png'), compose(t, clips[clip].at(s), ui))
        return
    n = int(SONG_LEN * FPS)
    done = {}
    for clip, s, i in sorted(((*source(i / FPS), i) for i in range(n)), key=lambda r: (r[0], r[1])):
        done[i] = cv2.imencode('.jpg', compose(i / FPS, clips[clip].at(s), ui), [cv2.IMWRITE_JPEG_QUALITY, 94])[1]
    video = OUT / 'v12-discord.video.mp4'
    ff = subprocess.Popen([FF, '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'mjpeg', '-i', '-',
                           '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-b:v', '6500k', '-maxrate', '8000k',
                           '-bufsize', '13000k', '-movflags', '+faststart', str(video)], stdin=subprocess.PIPE)
    for i in range(n):
        ff.stdin.write(done[i].tobytes())
    ff.stdin.close(); ff.wait()
    subprocess.run([FF, '-y', '-loglevel', 'error', '-i', str(video), '-i', str(v11.V / SONG['file']), '-map', '0:v', '-map', '1:a',
                    '-c:v', 'copy', '-af', f'afade=t=out:st={SONG_LEN - 0.8}:d=0.8,loudnorm=I=-14:TP=-1.5:LRA=11',
                    '-ar', '44100', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart',
                    str(OUT / 'v12-discord.mp4')], check=True)
    print(f'-> out/v12-discord.mp4 ({SONG_LEN:.1f}s)')


if __name__ == '__main__':
    main()
