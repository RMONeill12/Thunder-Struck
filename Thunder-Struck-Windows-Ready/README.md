# Thunder Struck

Thunder Struck by RMO Productions is a Windows weather-map app powered by Windy. It provides dedicated maps for temperature, radar and lightning, fog, and rain/clouds without requiring an app account.

Version 1.1 adds a forecast dashboard, hourly/daily/weekly views, location search, light/dark appearance, and GitHub Release update checks.

## Run locally

1. Install Node.js 22 LTS.
2. Run `npm install`.
3. Run `npm start`.

## Build the Windows installer

Run `npm run dist`. The installer will be placed in `release/`.

The included GitHub Actions workflow can also build it. Open the **Actions** tab, select **Build Windows Installer**, choose **Run workflow**, and download the `Thunder-Struck-Windows-Installer` artifact when it finishes.

## Publishing

Recommended repository name: **Thunder-Struck**

Included workflow filename: **build-windows-installer.yml**

The repository may be public or private. GitHub Actions builds work in either. If you publish the app publicly, review Windy's current embedding and commercial-use terms for your intended distribution.

## Live forecast setup

Windy's embeddable maps do not require a key, but the forecast cards use Windy's Point Forecast API. Add your key in GitHub under **Settings → Secrets and variables → Actions** as a repository secret named `WINDY_API_KEY`. Users of the installed app do not need to sign in.

## Update checks

The built-in updater checks the latest published Release in `RMOneill12/Thunder-Struck`. The repository must be public, and the release should have a tag such as `v1.1.0` plus the Windows Setup `.exe` attached.

## Data and privacy

Weather maps are loaded from Windy's official embeddable map service. Thunder Struck does not contain user accounts. Location and unit preferences are saved only in the app's local browser storage. An internet connection is required.

Weather data and visualization © Windy.com and its respective data providers. Map data © OpenStreetMap contributors.
