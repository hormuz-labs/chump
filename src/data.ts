// Everything on the page comes from here.
//
// head: where the skull sits in the photo, in percent, measured by tools/heads.py
// (MediaPipe Face Mesh + rembg person segmentation) and stored in heads.json.
//   cx  centre of the head (of width)    rx   half the head width (of width)
//   top top of the hair (of height)      cut  forehead line where the lid lifts (of height)
//   roll head tilt in degrees
//
// inside: what lives in the head. scan: the scan report shown on the first knock;
// a value of '{poops}' is filled in live as the cat goes.
// quotes: one per knock, each drawn in the medium it came from. Every one was checked
// against a transcript or major outlet (wording, date, setting) before going in.
// audio: optional path to a real clip (e.g. "/audio/trump-1.mp3"), played with that card.

export type Medium =
  | { kind: 'post'; text: string; date: string }
  | { kind: 'chat'; app: string; group: string; system?: string; messages: { from: string; text: string }[]; source: string }
  | { kind: 'tv'; text: string; show: string; context?: string }
  // repeat: said that many times; again: how the repeats are shown (they varied)
  | { kind: 'transcript'; text: string; source: string; context?: string; repeat?: number; again?: string }
  | { audio: '/audio/hegseth-germs.mp3', punch: 'Germs are not a real thing.', kind: 'stat'; value: number; of: number; unit: string; source: string };

// punch: the short, verbatim bit that pops out of the head
export type Quote = Medium & { audio?: string; punch?: string };

export type Inside = 'bucket' | 'cat' | 'bottle' | 'germs' | 'bomb';

export type Head = {
  cx: number;
  rx: number;
  top: number;
  cut: number;
  roll: number;
  // where the ML-warped expressions (tools/faces.py) sit over the photo, in percent
  face: { x: number; y: number; w: number; h: number };
  // where the head pivots on the neck when it wobbles (tools/cutout.py), in percent
  neck: { x: number; y: number };
};

export type Person = {
  id: string;
  name: string;
  short: string;
  role: string;
  handle?: string;
  photo: string;
  head: Head;
  inside: Inside;
  // the backdrop behind the cut-out, and the listing on the first card
  tone: string;
  listing: { title: string; lines: string[] };
  scan: [string, string][];
  quotes: Quote[];
};

import heads from './heads.json';

const head = (id: keyof typeof heads): Head => {
  const { cx, rx, top, cut, roll, face, neck } = heads[id];
  return { cx, rx, top, cut, roll, face, neck };
};

const NO_BRAIN: [string, string] = ['Brain', 'Not detected'];

export const people: Person[] = [
  {
    id: 'trump',
    name: 'Donald J. Trump',
    short: 'Trump',
    role: 'President of the United States',
    handle: '@realDonaldTrump',
    photo: '/img/trump.jpg',
    head: head('trump'),
    inside: 'bucket',
    tone: '#f0a23c',
    listing: {
      title: 'FOR LEASE · Penthouse, top floor',
      lines: ['Huge. Tremendous ceilings.', 'Unfurnished since 1946.', 'Acoustics: the best. Everybody says so.', 'Previous tenant: one (1) peanut bucket.'],
    },
    scan: [NO_BRAIN, ['Peanuts', 'One bucket, the best bucket'], ['Echo', 'Tremendous']],
    quotes: [
      { audio: '/audio/trump-bestwords.mp3', punch: 'I have the best words.', kind: 'transcript', text: 'I know words. I have the best words.', source: 'Campaign rally, Hilton Head, SC · Dec 30, 2015' },
      { audio: '/audio/trump-cats.mp3', punch: 'They’re eating the cats.',
        kind: 'transcript',
        text: 'In Springfield, they’re eating the dogs. The people that came in. They’re eating the cats. They’re eating the pets of the people that live there.',
        source: 'Presidential debate, Philadelphia · Sep 10, 2024',
      },
      { punch: 'covfefe', kind: 'post', text: 'Despite the constant negative press covfefe', date: 'May 31, 2017' },
      { audio: '/audio/trump-concepts.mp3', punch: 'I have concepts of a plan.', kind: 'transcript', text: 'I have concepts of a plan.', source: 'Presidential debate, Philadelphia · Sep 10, 2024', context: 'Asked for his health care plan' },
      { audio: '/audio/trump-injection.mp3', punch: 'by injection inside or almost a cleaning',
        kind: 'transcript',
        text: 'And then I see the disinfectant, where it knocks it out in a minute, one minute. And is there a way we can do something like that by injection inside or almost a cleaning…',
        source: 'White House briefing · Apr 23, 2020',
      },
      { audio: '/audio/trump-windmills.mp3', punch: 'the noise causes cancer.', kind: 'transcript', text: '…your house just went down 75 percent in value. And they say the noise causes cancer.', source: 'NRCC dinner, Washington · Apr 2, 2019', context: 'On windmills' },
      { audio: '/audio/trump-hannibal.mp3', punch: 'The late, great Hannibal Lecter.', kind: 'transcript', text: 'The late, great Hannibal Lecter. He’s a wonderful man.', source: 'Rally, Wildwood, NJ · May 11, 2024' },
      { audio: '/audio/trump-shark.mp3', punch: 'I’ll take electrocution every single time.', kind: 'transcript', text: 'I’ll take electrocution every single time. I’m not getting near the shark.', source: 'Rally, Las Vegas · Jun 9, 2024', context: 'Sinking boat, battery, shark' },
      { audio: '/audio/trump-weave.mp3', punch: 'I do the weave.', kind: 'transcript', text: 'You know, I do the weave. You know what the weave is?', source: 'Rally, Johnstown, PA · Aug 30, 2024' },
      { punch: 'a very stable genius at that!',
        kind: 'post',
        text: '….to President of the United States (on my first try). I think that would qualify as not smart, but genius….and a very stable genius at that!',
        date: 'Jan 6, 2018',
      },
      { audio: '/audio/trump-genius.mp3', punch: 'I’m an extremely stable genius.', kind: 'transcript', text: 'I’m an extremely stable genius.', source: 'White House, Roosevelt Room · May 23, 2019' },
      { audio: '/audio/trump-person.mp3', punch: 'Person, woman, man, camera, TV.', kind: 'tv', text: 'Person, woman, man, camera, TV.', show: 'Fox News interview · Jul 2020', context: 'On his cognitive test' },
      { audio: '/audio/trump-television.mp3', punch: 'This is going to be great television.', kind: 'transcript', text: 'This is going to be great television, I will say that.', source: 'Oval Office, with Zelensky · Feb 28, 2025' },
    ],
  },
  {
    id: 'vance',
    name: 'JD Vance',
    short: 'Vance',
    role: 'Vice President',
    photo: '/img/vance.jpg',
    head: head('vance'),
    inside: 'cat',
    tone: '#7f9c86',
    listing: {
      title: 'FOR LEASE · Starter home, needs work',
      lines: ['Recently converted to a litter box.', 'Current tenant: one cat, childless.', 'Opinions included. They rotate.', 'Smell: improving.'],
    },
    scan: [NO_BRAIN, ['Cats', '1, using it as a litter box'], ['Poops so far', '{poops}']],
    quotes: [
      { audio: '/audio/vance-catladies.mp3', punch: 'childless cat ladies',
        kind: 'tv',
        text: '…a bunch of childless cat ladies who are miserable at their own lives and the choices that they’ve made…',
        show: 'Tucker Carlson Tonight · Jul 29, 2021',
      },
      { audio: '/audio/vance-nevertrump.mp3', punch: 'I never liked him.', kind: 'tv', text: 'I’m a “Never Trump” guy. I never liked him.', show: 'Charlie Rose · Oct 2016' },
      { punch: 'he’s America’s Hitler.',
        kind: 'chat',
        app: 'Facebook message',
        group: 'To his law school roommate',
        messages: [
          {
            from: 'JD Vance',
            text: 'I go back and forth between thinking Trump is a cynical asshole like Nixon who wouldn’t be that bad (and might even prove useful) or that he’s America’s Hitler.',
          },
        ],
        source: 'Private message · Feb 2016 · made public in 2022',
      },
      { audio: '/audio/vance-stories.mp3', punch: 'If I have to create stories…',
        kind: 'tv',
        text: 'If I have to create stories so that the American media actually pays attention to the suffering of the American people, then that’s what I’m going to do.',
        show: 'CNN, State of the Union · Sep 15, 2024',
        context: 'On the pet-eating story',
      },
      { audio: '/audio/vance-factcheck.mp3', punch: 'you guys weren’t going to fact-check.', kind: 'transcript', text: 'The rules were that you guys weren’t going to fact-check.', source: 'Vice presidential debate, CBS · Oct 1, 2024' },
      { audio: '/audio/vance-thankyou.mp3', punch: 'Have you said thank you once…', kind: 'transcript', text: 'Have you said thank you once…', source: 'Oval Office, to Volodymyr Zelensky · Feb 28, 2025' },
      { punch: 'I just hate bailing Europe out again.',
        kind: 'chat',
        app: 'Signal',
        group: 'Houthi PC small group',
        messages: [
          { from: 'JD Vance', text: 'If you think we should do it let’s go. I just hate bailing Europe out again.' },
          { from: 'Pete Hegseth', text: 'VP: I fully share your loathing of European free-loading. It’s PATHETIC.' },
        ],
        source: 'Mar 2025 · published by The Atlantic',
      },
    ],
  },
  {
    id: 'rubio',
    name: 'Marco Rubio',
    short: 'Rubio',
    role: 'Secretary of State, National Security Adviser, and more',
    handle: '@marcorubio',
    photo: '/img/rubio.jpg',
    head: head('rubio'),
    inside: 'bottle',
    tone: '#3d6db5',
    listing: {
      title: 'FOR LEASE · Shared office space',
      lines: ['Four job titles, one occupant.', 'Comes with emergency water.', 'Polite smile fitted as standard.', 'Desk shared with Secretary of State.'],
    },
    scan: [NO_BRAIN, ['Jobs held', '4 at once'], ['Water', '1 bottle, for emergencies']],
    quotes: [
      { audio: '/audio/rubio-dispel.mp3', punch: 'Let’s dispel once and for all with this fiction…',
        kind: 'transcript',
        text: 'Let’s dispel once and for all with this fiction that Barack Obama doesn’t know what he’s doing.',
        again: '…this fiction that Barack Obama doesn’t know what he’s doing…',
        source: 'Republican debate, Manchester, NH · Feb 6, 2016',
        repeat: 4,
      },
      { audio: '/audio/rubio-pants.mp3', punch: 'Maybe to make sure his pants weren’t wet.', kind: 'transcript', text: 'Then he asked for a full-length mirror. Maybe to make sure his pants weren’t wet.', source: 'Rally, Dallas · Feb 26, 2016', context: 'On Donald Trump' },
      { audio: '/audio/rubio-spraytan.mp3', punch: 'the worst spray tan in America', kind: 'transcript', text: '…the guy with the worst spray tan in America is attacking me for putting on makeup.', source: 'Rally in Georgia · Feb 27, 2016' },
      { audio: '/audio/rubio-hands.mp3', punch: 'you know what they say about men with small hands?', kind: 'transcript', text: 'Have you seen his hands? … You know what they say about men with small hands? You can’t trust them.', source: 'Rally, Salem, VA · Feb 28, 2016' },
      { punch: 'Donald Trump is a con artist', kind: 'post', text: 'Donald Trump is a con artist — and he cannot be our nominee. #NeverTrump', date: 'Feb 26, 2016' },
      { punch: 'Selling watches in Manhattan.',
        kind: 'transcript',
        text: 'If he hadn’t inherited $200 million, you know where Donald Trump would be right now? Selling watches in Manhattan.',
        source: 'Republican debate, Houston · Feb 25, 2016',
      },
      { audio: '/audio/rubio-fourjobs.mp3', punch: 'as someone with four jobs', kind: 'transcript', text: 'For me personally, this is the most meaningful Labor Day of my life as someone with four jobs.', source: 'Cabinet meeting, White House · Aug 26, 2025' },
    ],
  },
  {
    id: 'hegseth',
    name: 'Pete Hegseth',
    short: 'Hegseth',
    role: 'Secretary of Defense (of War)',
    photo: '/img/hegseth.jpg',
    head: head('hegseth'),
    inside: 'germs',
    tone: '#5c9f45',
    listing: {
      title: 'FOR LEASE · Fully cultured',
      lines: ['Unwashed since 2009.', 'Home to billions of tenants.', 'Group chat included. Journalists welcome.', 'Germs are not a real thing.'],
    },
    scan: [NO_BRAIN, ['Germs', 'Billions, unwashed since 2009'], ['Group chats', '1, plus a journalist']],
    quotes: [
      { audio: '/audio/hegseth-hands.mp3', punch: 'I don’t think I’ve washed my hands for 10 years.', kind: 'tv', text: 'I don’t think I’ve washed my hands for 10 years. Really, I don’t really wash my hands…', show: 'Fox & Friends Weekend · Feb 10, 2019' },
      { kind: 'tv', text: 'Germs are not a real thing. I can’t see them, therefore they’re not real.', show: 'Fox & Friends Weekend · Feb 10, 2019' },
      { punch: 'THIS IS WHEN THE FIRST BOMBS WILL DEFINITELY DROP',
        kind: 'chat',
        app: 'Signal',
        group: 'Houthi PC small group',
        system: 'Michael Waltz added Jeffrey Goldberg',
        messages: [{ from: 'Pete Hegseth', text: '1415: Strike Drones on Target (THIS IS WHEN THE FIRST BOMBS WILL DEFINITELY DROP…)' }],
        source: 'Mar 2025 · published by The Atlantic',
      },
      { punch: 'We are currently clean on OPSEC',
        kind: 'chat',
        app: 'Signal',
        group: 'Houthi PC small group',
        messages: [{ from: 'Pete Hegseth', text: 'MORE TO FOLLOW (per timeline)\nWe are currently clean on OPSEC\nGodspeed to our Warriors.' }],
        source: 'Mar 2025 · published by The Atlantic',
      },
      { audio: '/audio/hegseth-warplans.mp3', punch: 'Nobody was texting war plans', kind: 'transcript', text: 'Nobody was texting war plans, and that’s all I have to say about that.', source: 'To reporters, Honolulu · Mar 24, 2025' },
      { audio: '/audio/hegseth-beardos.mp3', punch: 'No more beardos.', kind: 'transcript', text: 'No more beardos.', source: 'Speech to generals, Quantico · Sep 30, 2025' },
      { audio: '/audio/hegseth-fat.mp3', punch: 'fat generals and admirals',
        kind: 'transcript',
        text: '…it’s completely unacceptable to see fat generals and admirals in the halls of the Pentagon…',
        source: 'Speech to generals, Quantico · Sep 30, 2025',
      },
    ],
  },
  {
    id: 'netanyahu',
    name: 'Benjamin Netanyahu',
    short: 'Netanyahu',
    role: 'Prime Minister of Israel',
    photo: '/img/netanyahu.jpg',
    head: head('netanyahu'),
    inside: 'bomb',
    tone: '#d44a3b',
    listing: {
      title: 'FOR SUBLET · Well-kept, one owner',
      lines: ['Sublet to the late Supreme Leader.', 'He finds the bomb drawing hilarious.', 'Red line drawn on by hand.', 'Majority not included.'],
    },
    scan: [NO_BRAIN, ['Worries', 'Iran, the courts, cigars, 61'], ['Bombs', '1, cartoon, with a red line']],
    quotes: [
      { audio: '/audio/netanyahu-bomb.mp3', punch: 'This is a bomb; this is a fuse.', kind: 'transcript', text: 'This is a bomb; this is a fuse.', source: 'UN General Assembly, holding a cartoon bomb · Sep 27, 2012' },
      { audio: '/audio/netanyahu-redline.mp3', punch: 'A red line should be drawn right here.', kind: 'transcript', text: 'A red line should be drawn right here.', source: 'Same speech, drawing on it with a marker · Sep 27, 2012' },
      { audio: '/audio/netanyahu-spring.mp3', punch: 'by next spring, at most by next summer',
        kind: 'transcript',
        text: 'And by next spring, at most by next summer, at current enrichment rates, they will have finished the medium enrichment and move on to the final stage.',
        source: 'Same speech · Sep 27, 2012',
      },
      { audio: '/audio/netanyahu-saddam.mp3', punch: 'I guarantee you',
        kind: 'transcript',
        text: '…if you take out Saddam’s regime, I guarantee you that it will have enormous positive reverberations on the region.',
        source: 'US House hearing · Sep 12, 2002',
      },
      { punch: 'There will be nothing, because there is nothing.', kind: 'transcript', text: 'There will be nothing, because there is nothing.', source: 'Likud faction meeting · Jan 2, 2017', context: 'On the corruption investigations' },
      { punch: 'Arab voters are moving in droves',
        kind: 'tv',
        text: 'The right-wing government is in danger. Arab voters are moving in droves to the polling stations.',
        show: 'Election-day video · Mar 17, 2015',
      },
      { audio: '/audio/netanyahu-nobel.mp3', punch: 'It’s nominating you for the Peace Prize', kind: 'transcript', text: 'It’s nominating you for the Peace Prize, which is well-deserved and you should get it.', source: 'White House dinner, to Donald Trump · Jul 7, 2025' },
      { punch: '53 seats. Needed 61.', kind: 'stat', value: 53, of: 61, unit: 'seats', source: 'Knesset election · Oct 27, 2026' },
    ],
  },
];
