# Real browser captures and GIFs

[← README](../README.md) · [Story manifest](capture-stories.json)

Captured from the actual local Recall interface on **November 16, 2026**, at **1280 × 960**. These are edited screenshot sequences, not mockups or continuous recordings. Frame holds make each state readable; intermediate questions and reading time are shortened.

All sessions use demonstration notes. No API key was entered, no live AI response was fabricated, and no personal study data was included. The settings GIF demonstrates configuration; the Feynman GIF uses manual reflection.

## Capture fresh frames

1. Run `npm run dev` with a fresh browser profile or local origin so only demonstration data appears.
2. Use a consistent viewport for every frame. The current stories use 1280 × 960.
3. Interact with the real UI and save a JPEG after each visible state in the manifest. Wait for the page or dialog to finish updating.
4. Match the filenames in [capture-stories.json](capture-stories.json), or update it for the new story.
5. Keep credentials out of recordings and use fictional or approved study notes.

```text
/tmp/recall-doc-frames/
├── retrieval/  # 00-home.jpg … 06-schedule.jpg
├── feynman/    # 00-create.jpg … 06-saved.jpg
├── settings/   # 00-openai.jpg … 03-openai-model.jpg
└── tour/       # 00-library.jpg … 05-search.jpg
```

Save the initial empty dashboard as a full-page JPEG at `docs/media/overview.jpg` for the README hero.

## Encode the GIFs

Install [FFmpeg](https://ffmpeg.org/) using your normal package manager, then run from the repository root:

```sh
node scripts/build-demo-gifs.mjs /absolute/path/to/recall-doc-frames
```

The script reads the manifest’s frame order and durations, normalizes screenshots to a consistent 1000 × 750 canvas, and encodes looping GIFs at four frames per second with an optimized 128-color palette. Normalizing first prevents browser scrollbar differences from resetting FFmpeg’s palette filter. Each story’s first frame is also copied as a static JPEG poster. Input screenshots stay outside Git; output GIFs and posters go into `docs/media/`.

FFmpeg is a documentation tool only. No extra dependencies are added to Recall, and GIF generation does not run during `npm run build`.

## Review before committing

- Watch the full loop; confirm that the intended steps and text are visible.
- Check for keys, personal information, private notes, or unrelated content.
- Keep a static poster link beside every animation for readers who prefer no motion.
- Verify dimensions, duration, frame count, and size with `ffprobe`.

```sh
ffprobe -v error -count_frames \
  -show_entries stream=width,height,nb_read_frames:format=duration,size \
  -of json docs/media/retrieval-practice.gif
```
