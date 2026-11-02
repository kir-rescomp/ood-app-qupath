# QuPath on Open OnDemand (Selkies streaming)

An Open OnDemand Batch Connect app that runs QuPath in an Apptainer container
on a compute node and streams it to the browser as a single application
window. The stream is produced by [Selkies](https://github.com/selkies-project/selkies)
(H.264 over a WebSocket), which passes through the portal's `/rnode` reverse
proxy without any additional ports, STUN or TURN services.

```
qupath-ood/
├── container/
│   ├── qupath-selkies.def    Apptainer definition (Ubuntu 24.04, QuPath, Selkies, Openbox)
│   ├── qupath-session        Launcher run inside the stream: Openbox + QuPath, window fitting, exit marker
│   └── openbox-rc.xml        Minimal window-manager configuration
└── bc_qupath/                Batch Connect app (copy to /var/www/ood/apps/sys/qupath)
    ├── manifest.yml
    ├── form.yml
    ├── submit.yml.erb
    ├── view.html.erb
    └── template/
        ├── before.sh.erb     Port, session token, master token, exit marker
        ├── script.sh.erb     Starts the container (site settings at the top)
        └── after.sh.erb      Provisions the session token once Selkies answers
```

## How a session runs

1. `before.sh` chooses a free port and creates two secrets: the session token
   (OnDemand's `password`, carried by the "Open QuPath" link) and a master
   token used only to provision it.
2. `script.sh` starts `apptainer exec --cleanenv <sif> selkies-session`.
   Inside the container, `selkies-session` starts an Xvfb display, runs
   `qupath-session` on it, and starts the Selkies server on the chosen port.
3. `after.sh` waits for the port, registers the session token with Selkies
   using the master token, and only then is the session reported as running.
   Selkies runs in secure mode: WebSocket connections without a valid token
   are refused, so other users on the cluster network cannot reach the stream.
4. `qupath-session` starts Openbox and QuPath, maximises the main QuPath window
   and keeps it fitted as Selkies resizes the display to the browser window.
5. When QuPath exits, the launcher writes `qupath.exited` in the session
   directory; `script.sh` sees it, stops the container and the job ends,
   releasing the allocation.

## Build the image

On a machine with Apptainer 1.2 or later and internet access:

```bash
cd container
apptainer build qupath-selkies_0.7.0.sif qupath-selkies.def
```

Another QuPath release: `--build-arg QUPATH_VERSION=0.6.0` (and name the image
accordingly). Copy the image to the path set in `script.sh.erb`.

## Deploy the app

```bash
sudo cp -r bc_qupath /var/www/ood/apps/sys/qupath
```

Review every line marked `SITE`:

| File | Setting |
|---|---|
| `form.yml` | `cluster`, the partition names, and the `qupath_version` that matches the installed image |
| `script.sh.erb` | `QUPATH_SIF` (image path), `BIND_PATHS` (add the target if `/well` is a symlink), and `module load Apptainer` if Apptainer is not on the default `PATH` |
| `submit.yml.erb` | Any additional Slurm options the BMRC partitions require (account, QoS, GPU syntax) |

The compute nodes need `curl` on the host (used by `after.sh`), and the
portal's `host_regex` must admit them, as for any interactive app.

## Resource defaults

- **Java heap** is set to approximately 75% of the requested memory through
  `JAVA_TOOL_OPTIONS=-Xmx…`, which takes precedence over the
  `-XX:MaxRAMPercentage=50` in QuPath's launcher configuration. QuPath sizes
  its tile cache from the heap (25% by default).
- **Rendering** defaults to JavaFX's software pipeline (`-Dprism.order=sw`),
  which is reliable on CPU nodes. The OpenGL option is experimental.
- **Encoding** uses the software H.264 encoder on CPU partitions
  (`--use-cpu=true`). With "Request a GPU", the container is started with
  `--nv` and Selkies uses NVENC where the driver provides it.

## Behaviour users should know

- On first use, QuPath shows its licence notice. Until it is accepted, the
  main window cannot be maximised (JavaFX fixes the owner window's size while
  a modal dialog is open); it fills the browser tab immediately afterwards.
  Selecting "Don't show this again" removes the notice from later sessions.
- QuPath preferences, the QuPath user directory and installed extensions are
  stored in the user's home directory and persist between sessions.
- Closing the browser tab does not stop QuPath; reopening the link resumes the
  same session. *File > Quit* in QuPath, or *Delete* on the session card,
  ends the job.
- Compute nodes without internet access cannot check for QuPath updates; the
  check fails without affecting the session. Setting "Check for updates" to
  "Never" in the welcome dialog avoids the attempt.
- Copy and paste between the local computer and QuPath uses the Selkies
  side panel; it is available because the portal is served over HTTPS.

## What has been tested

The image's package list, the Selkies 2.0.0 package and QuPath 0.7.0 were
installed on Ubuntu 24.04 and the rendered templates were run end to end with
the OnDemand helper functions simulated and Apptainer replaced by a shim that
reproduces `--cleanenv`:

- the session token is provisioned and the stream is served on the chosen port;
- WebSocket connections without a token are refused (401), and with a wrong
  token are closed by Selkies before any stream is sent;
- QuPath starts with the requested heap, renders through the software pipeline,
  and its main window is re-fitted at each display size tested (1280×720 to
  2560×1300); dialogs are kept on screen;
- quitting QuPath ends the job, with no processes left behind.

Not yet tested: the Apptainer build itself, the portal's `/rnode` proxy, BMRC
partitions and GPU (NVENC) encoding. These are the first things to verify on
the cluster.
