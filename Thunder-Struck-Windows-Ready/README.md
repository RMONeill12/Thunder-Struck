# Thunder Struck

Thunder Struck by RMO Productions is a Windows weather-map app powered by Windy. It provides dedicated maps for temperature, radar and lightning, fog, and rain/clouds without requiring an app account.

Version 1.2 added no-key current/hourly/daily forecasts, a Fishing Lakes map, permission controls, Windows tray behavior, and nearby thunderstorm-risk notifications. Version 1.3 adds a refreshed UI, live search suggestions, thumbtack lake markers with a distance-sorted lake list, and faster cached lake lookups.

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

## Forecast and fishing sources

Forecast cards use Open-Meteo and require no API key. Weather maps remain powered by Windy. Fishing Lakes displays OpenStreetMap waters explicitly tagged for fishing within 200 km. Community mapping is incomplete, so the map does not guarantee every fish-bearing waterbody. Always consult the local official stocking guide and fishing regulations.

## Background alerts

When notifications are enabled, closing the window leaves Thunder Struck in the Windows tray. It checks nearby Open-Meteo thunderstorm forecast points every 15 minutes. These are forecast-risk notifications, not measured lightning-strike detections.

## Update checks

The built-in updater checks the latest published Release in `RMOneill12/Thunder-Struck`. The repository must be public, and the release should have a tag such as `v1.1.0` plus the Windows Setup `.exe` attached.

## Data and privacy

Weather maps are loaded from Windy's official embeddable map service. Thunder Struck does not contain user accounts. Location and unit preferences are saved only in the app's local browser storage. An internet connection is required.

Weather data and visualization © Windy.com and its respective data providers. Map data © OpenStreetMap contributors.
