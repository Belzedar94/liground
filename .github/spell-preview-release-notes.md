LiGround with Spell Chess support, packaged from the `spell-chess` branch of this fork.

Spell Chess is chess with two consumable potions per side, cast as part of a move:

- **Freeze**: the 3x3 area around the target square is frozen. Pieces inside cannot move and do not attack, including your own.
- **Jump**: the target square, which must be occupied, becomes transparent, so sliders of both colours see through it.

A zone lives for your move and the single reply to it, then expires. Casting starts a three turn cooldown, shown as pips beside the hand.

## Downloads

| Platform | File |
| --- | --- |
| Windows installer | `LiGround-Spell-0.6.0-win-setup.exe` |
| Windows portable | `LiGround-Spell-0.6.0-win-portable.exe` |
| Linux | `LiGround-Spell-0.6.0-linux-x86_64.AppImage` |
| macOS, Apple silicon | `LiGround-Spell-0.6.0-mac-arm64.zip` |

`SHA256SUMS.txt` carries the checksum of every file listed above.

On Linux, mark the AppImage executable before running it:

```
chmod +x LiGround-Spell-0.6.0-linux-x86_64.AppImage
./LiGround-Spell-0.6.0-linux-x86_64.AppImage
```

The builds are unsigned on every platform. Windows SmartScreen shows a warning on first launch, and *More info* then *Run anyway* gets past it. On macOS, Gatekeeper refuses an unsigned app outright, so clear the quarantine flag after unzipping:

```
xattr -cr /Applications/liground.app
```

## Engine setup

No engine binaries ship inside these packages. Analysis of Spell Chess needs Spell-Stockfish 2.0:

1. Download the build for your platform, plus `Spell_v2.nnue`, from the [Spell-Stockfish 2.0 release](https://github.com/Belzedar94/Spell-Stockfish/releases/tag/v2.0). Windows has an avx2 and a bmi2 build, and there are builds for Linux and for macOS on Apple silicon.
2. Put the binary and the network in the same folder, and rename the network to `v2run1.nnue`. That is the name the engine looks for on its own, and without a network it refuses to evaluate anything. Keeping the name `Spell_v2.nnue` also works, but then the `EvalFile` option has to be set to that name by hand, in the engine settings table.
3. Start LiGround, open **Settings**, then **Engine**, then press **+** and point the entry at the binary. Set the working directory of that entry to the folder holding the network, since that is where the engine looks.
4. Choose `spell-chess` in the variant selector, then select the engine you just added.

An entry named `Spell-Stockfish` is listed out of the box, so there is a shorter route for the Windows installer. That entry looks for `spell-stockfish.exe` inside an `engines` folder next to the installed application, and it already points its working directory at the same place. Create `resources\engines` under the installation directory, since no such folder ships with the package, then put the binary in it renamed to `spell-stockfish.exe`, next to `v2run1.nnue`. The entry then works with nothing else to set.

The portable build and the AppImage unpack themselves to a fresh temporary folder on every run, so there is nowhere durable to put a binary. On those two, add the engine by hand as described above.

## What is in this preview

- Spell Chess board with the two potion hands, the cast target overlay and two step casting. Click a potion, click a target square, then play the move. Esc cancels a pending cast.
- A rule engine written for the GUI, since ffish carries no Spell Chess. It was checked move for move against the engine binary across 4688 positions.
- Casts render as potion chips in the move list and inside engine analysis lines, so an engine suggestion reads the same way a played move does.
- Pieces that a pending Freeze would lock grey out before the cast is committed, your own pieces included.
- Settings persistence is fixed. Values are written when they change, and every one of them is restored with its original type instead of coming back as a string.

## Known limitations

- PGN does not round trip casts. A saved game replays its moves, but the potion casts inside it are lost.
- `spell-chess` exists only in this fork and in Spell-Stockfish. No other engine and no online source understands it.
- Hardware acceleration is switched off in this build. Some driver and compositor combinations never hand Electron a surface to draw on, which leaves the window blank, and an analysis GUI loses nothing by rendering on the CPU.

## Rebuilding

`.github/workflows/spell-preview-build.yml` produces everything here on GitHub Actions and can be run again from the Actions tab.
