// Everything on the page comes from here.
//
// head: where the skull sits in the photo, in percent.
//   cx  centre of the head (of width)    rx   half the head width (of width)
//   top top of the hair (of height)      cut  forehead line where the lid lifts (of height)
//
// object: what floats out of the head. scan: the scan report shown on the first knock.
// quotes: one per knock, each drawn in the medium it came from.
// audio: optional path to a real clip (e.g. "/audio/trump-1.mp3"), played with that card.

export type Medium =
  | { kind: 'post'; text: string; date: string }
  | { kind: 'chat'; group: string; system?: string; messages: { from: string; text: string }[]; source: string }
  | { kind: 'tv'; text: string; show: string; context?: string }
  | { kind: 'transcript'; text: string; source: string; repeat?: number }
  | { kind: 'stat'; value: number; of: number; unit: string; source: string };

export type Quote = Medium & { audio?: string };

export type Person = {
  id: string;
  name: string;
  short: string;
  role: string;
  handle?: string;
  photo: string;
  head: { cx: number; rx: number; top: number; cut: number };
  object: string;
  scan: [string, string][];
  quotes: Quote[];
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
    head: { cx: 48.7, rx: 32, top: 7, cut: 32 },
    object: '🥜',
    scan: [NO_BRAIN, ['Peanuts', '1'], ['Echo', 'Tremendous. The best.']],
    quotes: [
      { kind: 'transcript', text: 'I know words. I have the best words.', source: 'Campaign rally, Hilton Head, SC · Dec 30, 2015' },
      { kind: 'post', text: 'Despite the constant negative press covfefe', date: 'May 31, 2017' },
      { kind: 'transcript', text: 'Nobody knew health care could be so complicated.', source: 'Meeting with governors, White House · Feb 27, 2017' },
      {
        kind: 'post',
        text: '…to President of the United States (on my first try). I think that would qualify as not smart, but genius….and a very stable genius at that!',
        date: 'Jan 6, 2018',
      },
      { kind: 'tv', text: 'Person, woman, man, camera, TV.', show: 'Fox News interview · Jul 2020', context: 'On his cognitive test' },
    ],
  },
  {
    id: 'vance',
    name: 'JD Vance',
    short: 'Vance',
    role: 'Vice President',
    photo: '/img/vance.jpg',
    head: { cx: 49.5, rx: 25, top: 5, cut: 23.5 },
    object: '🐈',
    scan: [NO_BRAIN, ['Cats', '1, on loan from a childless cat lady'], ['Opinion of Trump', 'Depends on the year']],
    quotes: [
      { kind: 'tv', text: '…a bunch of childless cat ladies who are miserable at their own lives…', show: 'Tucker Carlson Tonight · 2021' },
      { kind: 'tv', text: 'I’m a “Never Trump” guy. I never liked him.', show: 'Charlie Rose · 2016' },
      {
        kind: 'chat',
        group: 'Houthi PC small group',
        messages: [
          { from: 'JD Vance', text: 'I just hate bailing Europe out again.' },
          { from: 'Pete Hegseth', text: 'I fully share your loathing of European free-loading. It’s PATHETIC.' },
        ],
        source: 'Signal · Mar 2025 · published by The Atlantic',
      },
    ],
  },
  {
    id: 'rubio',
    name: 'Marco Rubio',
    short: 'Rubio',
    role: 'Secretary of State, National Security Adviser, and more',
    photo: '/img/rubio.jpg',
    head: { cx: 49.8, rx: 21, top: 3, cut: 21 },
    object: '💧',
    scan: [NO_BRAIN, ['Jobs held', '4 at once'], ['Water', 'One sip, 2013']],
    quotes: [
      {
        kind: 'transcript',
        text: 'Let’s dispel with this fiction that Barack Obama doesn’t know what he’s doing.',
        source: 'Republican debate, Manchester, NH · Feb 6, 2016',
        repeat: 4,
      },
      { kind: 'transcript', text: 'Have you seen his hands? … And you know what they say about men with small hands.', source: 'Rally in Salem, VA, about Donald Trump · Feb 28, 2016' },
      {
        kind: 'transcript',
        text: 'If he hadn’t inherited $200 million, you know where Donald Trump would be right now? Selling watches in Manhattan.',
        source: 'Republican debate, Houston · Feb 25, 2016',
      },
    ],
  },
  {
    id: 'hegseth',
    name: 'Pete Hegseth',
    short: 'Hegseth',
    role: 'Secretary of Defense (of War)',
    photo: '/img/hegseth.jpg',
    head: { cx: 50.4, rx: 22.6, top: 6, cut: 24.6 },
    object: '🦠',
    scan: [NO_BRAIN, ['Hand washes since 2009', '0'], ['Group chats', '1, plus a journalist']],
    quotes: [
      { kind: 'tv', text: 'I don’t think I’ve washed my hands for 10 years.', show: 'Fox & Friends · Feb 2019' },
      {
        kind: 'chat',
        group: 'Houthi PC small group',
        system: 'Michael Waltz added Jeffrey Goldberg',
        messages: [{ from: 'Pete Hegseth', text: 'We are currently clean on OPSEC.' }],
        source: 'Signal · Mar 2025 · published by The Atlantic',
      },
      { kind: 'transcript', text: 'Nobody was texting war plans, and that’s all I have to say about that.', source: 'To reporters, Honolulu · Mar 2025' },
    ],
  },
  {
    id: 'netanyahu',
    name: 'Benjamin Netanyahu',
    short: 'Netanyahu',
    role: 'Prime Minister of Israel',
    photo: '/img/netanyahu.jpg',
    head: { cx: 53.8, rx: 28.4, top: 6.2, cut: 26.5 },
    object: 'bomb',
    scan: [NO_BRAIN, ['Red lines', '1, drawn in marker'], ['Majority', '8 seats short']],
    quotes: [
      { kind: 'tv', text: 'There will be nothing, because there is nothing.', show: 'On the corruption investigations · 2017' },
      {
        kind: 'tv',
        text: 'The right-wing government is in danger. Arab voters are coming out in droves to the polling stations.',
        show: 'Election-day video · Mar 2015',
      },
      { kind: 'transcript', text: 'A red line should be drawn right here.', source: 'UN General Assembly, with a cartoon bomb · Sep 27, 2012' },
      { kind: 'stat', value: 53, of: 61, unit: 'seats', source: 'Knesset election · Oct 2026' },
    ],
  },
];
