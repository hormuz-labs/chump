# The stupidest thing you can do is pay your taxes

> *Knock knock.*
> *…*
> *…hello?*
> *Brain: not detected.*

**Live:** https://chump.agentshot.si

Five world leaders. One fist. Zero brains found so far, and we've been looking really hard.

You knock on a head. The skull cap pops off like a jar of pickles nobody's opened since 2016. You look inside. You are disappointed, but not surprised. Every quote is real. Every head is, regrettably, also real.

---

## What's inside the heads

We ran a full medical scan. The doctors have asked not to be named.

| Patient | Contents | Prognosis |
| --- | --- | --- |
| **Trump** | A bucket of peanuts | Stable. Peanuts are doing their best. |
| **Vance** | A cat, and what the cat left behind | The cat seems happy. That makes one of us. |
| **Rubio** | A water bottle | Hydrated. Not much else to report. |
| **Hegseth** | Germs. A *lot* of germs. | Has not washed hands in 10 years, says so himself. |
| **Netanyahu** | A bomb with a red line drawn on it | Has been "a few years away" from going off since 1992. |

---

## Features

- 👊 **Knocking.** Click the head. The head makes a hollow sound. Science cannot explain this.
- 🎩 **Removable skull cap.** Flies off and lands to the left, like their foreign policy.
- 🩻 **X-ray lens.** Hover to scan for a brain. The scanner works fine. The result is the problem.
- 🎙️ **Real voice clips** with word-synced captions, so you can read along at your own pace (which is still faster than they can think).
- 🖼️ **Meme maker.** Turns the current moment into a JPG for your group chat, your aunt, or a Reddit post you'll regret at 3am.
- 📈 **Live EEG.** A flat line with the occasional blip when knocked. Medically, this is called "a Tuesday."

---

## Run it yourself

You'll need Node. You won't need a brain. They didn't either.

```bash
npm install
npm run dev        # http://localhost:8765
npm run build      # spits out dist/
npx wrangler deploy
```

### Rebuilding the heads (optional, for the deeply committed)

The `tools/` folder is a small Python lab that cut out the portraits, measured each skull with machine learning, and found the exact line where the forehead stops and the void begins.

```bash
python -m venv .venv && source .venv/bin/activate
pip install rembg onnxruntime "mediapipe==0.10.14" opencv-python numpy pillow
python tools/heads.py   # writes public/img/masks/*-lid.png and *-hole.png
```

Fun fact: when the masks went missing, the heads stopped opening. For one brief moment the site was historically accurate.

---

## FAQ

**Is this satire?**
Yes. The quotes are real. The peanuts are a creative choice.

**Why is the domain called chump?**
It's short for "check how unoccupied my politicians are."

**Did you find a brain?**
We found a cat. Ask again next term.

**Should I actually not pay my taxes?**
No. Please pay your taxes. The title is a joke. The IRS has no sense of humour, and neither do the people in this app, but only one of them can garnish your wages.

**Can I add my own politician?**
Drop a portrait in `public/img/`, add an entry in `src/data.ts`, run the tools, and pick what's inside their head. We recommend something hollow.

---

## Disclaimer

This is parody and political commentary. Quotes are real and sourced. The contents of the heads are not medical findings, though we haven't ruled anything out.

No skulls were harmed in the making of this website. Several were found to be empty.
