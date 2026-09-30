# Workflow artifacts

These files preserve representative commands and code created or executed for the original Databricks quiz screenshot workflow. Paths below reflect that run; replace the attempt directory and question numbers for another quiz.

## Computer Use session code

The desktop interaction used the Computer Use plugin's `sky` API. Activate the `computer-use:computer-use` skill first and follow the current tool documentation; these snippets document the original run and are not a replacement for its current API guidance.

Initialize the API and inspect available applications:

```js
if (!globalThis.sky) {
  const { sky } = await import("@oai/sky");
  globalThis.sky = sky;
}
const apps = await sky.list_apps();
apps;
```

Select the intended browser window from the returned app/window list, activate it, then inspect the visible screen before using coordinates:

```js
const win = await sky.get_window(/* returned browser app/window identity */);
await sky.activate_window(win);
await sky.get_window_state(win);
```

Scroll in small increments and inspect the state again before capturing:

```js
await sky.scroll(/* direction and amount supported by current Computer Use docs */);
await sky.get_window_state(win);
```

The original run used the Computer Use screenshot output as the visual source, then cropped each capture to the visible question card. Avoid guessing coordinates from an old screenshot: reacquire screen state after scrolling or changing window/zoom.

## Directory inspection and copy commands

The attempt folder used in the original run was:

```text
C:\Endava\EndevLocal\learning\databricks\data-eng-associate\lakeflow-job-workloads\quiz-attempts\1
```

Inspect existing screenshots before saving:

```powershell
$attemptDir = 'C:\Endava\EndevLocal\learning\databricks\data-eng-associate\lakeflow-job-workloads\quiz-attempts\1'
Get-ChildItem -LiteralPath $attemptDir -File | Select-Object Name, Length, FullName
```

The original workflow staged cropped images, then copied only the missing question images into the attempt folder. Keep the no-overwrite check when adapting this command:

```powershell
$stagingDir = '<staging-directory>'
$attemptDir = 'C:\Endava\EndevLocal\learning\databricks\data-eng-associate\lakeflow-job-workloads\quiz-attempts\1'
6..20 | ForEach-Object {
    $name = "q$_.png"
    $source = Join-Path $stagingDir $name
    $destination = Join-Path $attemptDir $name
    if ((Test-Path -LiteralPath $source) -and -not (Test-Path -LiteralPath $destination)) {
        Copy-Item -LiteralPath $source -Destination $destination
    }
}
Get-ChildItem -LiteralPath $attemptDir -File | Sort-Object Name | Select-Object Name, Length
```

## Crop helper

`crop_quiz.py` is the Python helper generated and executed in the original run. It reads a JSON manifest with records shaped like `{"number": 6, "rawPath": "capture.png", "crop": [left, top, right, bottom]}`, crops each image, and writes `qN.png` into the output directory. It requires Pillow. The exact helper is included alongside this file.

Example invocation:

```powershell
python .\assets\crop_quiz.py .\quiz-crops.json .\staging
```

The original execution used the bundled Python runtime and a manifest in the task's temporary work directory. The reusable workflow should prefer direct clean captures where possible and use cropping only when it preserves all question content and readable answer text.
