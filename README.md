<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./public/logo_full.svg">
  <img src="./public/logo_full_light.svg" alt="Loom" style="margin: 20px 0;">
</picture>
</p>

# Loom

<p align="center">
<img src="https://github.com/DaniBorisov/Loom/actions/workflows/release.yml/badge.svg" alt="Loom Release" />
<img src="https://github.com/DaniBorisov/Loom/actions/workflows/ci.yml/badge.svg" alt="Loom CI">
</p>
<p align="center">
<a href="https://github.com/DaniBorisov/Loom/blob/develop/LICENSE"><img alt="GitHub" src="https://img.shields.io/github/license/DaniBorisov/Loom"></a>

**Loom** is a free and open source software application for managing requests for your media library. It integrates with the media server of your choice: [Jellyfin](https://jellyfin.org), [Plex](https://plex.tv), and [Emby](https://emby.media/). In addition, it integrates with your existing services, such as **[Sonarr](https://sonarr.tv/)**, **[Radarr](https://radarr.video/)**.

## Current Features

- Full Jellyfin/Emby/Plex integration including authentication with user import & management.
- Support for **PostgreSQL** and **SQLite** databases.
- Supports Movies, Shows and Mixed Libraries.
- Ability to change email addresses for SMTP purposes.
- Easy integration with your existing services. Currently, Loom supports Sonarr and Radarr. More to come!
- Jellyfin/Emby/Plex library scan, to keep track of the titles which are already available.
- Customizable request system, which allows users to request individual seasons or movies in a friendly, easy-to-use interface.
- Incredibly simple request management UI. Don't dig through the app to simply approve recent requests!
- Granular permission system.
- Support for various notification agents.
- Mobile-friendly design, for when you need to approve requests on the go!
- Support for watchlisting & blocklisting media.

With more features on the way! Check out our [issue tracker](/../../issues) to see the features which have already been requested.

## Getting Started

Check out our documentation for instructions on how to install and run Seerr:

https://docs.seerr.dev/getting-started/

## Preview

<img src="./public/preview.jpg" alt="Loom application preview" />

## Migrating from Overseerr/Jellyseerr to Seerr

Read our [release announcement](https://docs.seerr.dev/blog/seerr-release) to learn what Seerr means for Jellyseerr and Overseerr users.

Please follow our [migration guide](https://docs.seerr.dev/migration-guide) for detailed instructions on migrating from Overseerr or Jellyseerr.

## Support

- Check out the [Seerr Documentation](https://docs.seerr.dev) before asking for help. Your question might already be in the docs!
- You can ask questions in the Help category of our [GitHub Discussions](/../../discussions).
- Bug reports and feature requests can be submitted via [GitHub Issues](/../../issues).

## API Documentation

You can access the API documentation from your local Loom install at http://localhost:5055/api-docs

## Community

You can ask questions, share ideas, and more in [GitHub Discussions](/../../discussions).

Our [Code of Conduct](./CODE_OF_CONDUCT.md) applies to all Loom community channels.

## Contributing
You can help improve Loom too! Check out our [Contribution Guide](./CONTRIBUTING.md) to get started.

## Credits

**Loom** is a fork of [Seerr](https://github.com/seerr-team/seerr) (formerly Jellyseerr, which itself builds on [Overseerr](https://github.com/sct/overseerr)). Thank you to the Seerr, Jellyseerr, and Overseerr contributors for the foundation this project stands on.

## License

Loom is distributed under the terms of the original MIT license. The unmodified original license text is preserved in [LICENSE](./LICENSE).
