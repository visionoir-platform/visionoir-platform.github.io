# MP3 encoder

FREQUENCY links the ES module from `@breezystack/lamejs` version 1.2.7 when an MP3 export is selected. This is the unchanged `package/dist/lamejs.js` from the published npm tarball. The package declares LGPL-3.0. This notice and the upstream terms apply to the encoder independently of the licence of the workstation or the user's recording.

- [Original LAME project and contributors](https://lame.sourceforge.net/)
- [lamejs upstream JavaScript port](https://github.com/zhuker/lamejs)
- [Corresponding source and build configuration at the npm gitHead](https://github.com/shijinyu/lamejs/tree/1fb0ef5fa177413107e2e107d054a9b994e3f79c)
- [Download the corresponding source tree](https://github.com/shijinyu/lamejs/archive/1fb0ef5fa177413107e2e107d054a9b994e3f79c.tar.gz)
- [Published npm archive](https://registry.npmjs.org/@breezystack/lamejs/-/lamejs-1.2.7.tgz)
- [Upstream notice](./LAME-NOTICE.txt), [LGPL v3](./LGPL-3.0.txt), [GPL v3](./GPL-3.0.txt)

The tarball integrity is `sha512-6wc7ck65ctA75Hq7FYHTtTvGnYs6msgdxiSUICQ+A01nVOWg6rqouZB8IdyteRlfpYYiFovkf67dIeOgWIUzTA==`. To use a modified or replacement encoder, build the corresponding source, replace this directory's `lamejs.js` with the resulting ES module exporting `Mp3Encoder`, then use the public Vite build command. The encoder runs locally and carries its own licensing and reverse-engineering permissions. No encoder code is required for WAV, MIDI or session backup.
