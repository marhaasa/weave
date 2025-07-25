# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).



## 0.2.0 - 2025-06-11

### Added
- Added ability to import items from local drive to selected workspace
- Added ability to export selected item to local drive


## 0.1.20 - 2025-06-10

### Fixed
- Update README to reflect changes
- Removed cacheing due to problems related to fab cp and fb mv
- Clean up


## 0.1.19 - 2025-06-09

### Fixed
- Added "fab mv" functionality to move items between workspaces
- Fixed skeleton loading bars for workspaces and workspace items
- Added job polling
- Added debounced navigation


## 0.1.18 - 2025-06-02

### Fixed
- Reworked interactions with the fabric CLI to go through fabricService
- Added run job, run sync job and view last job details for datapipelines and spark job definitions
- Refactored from Notebook actions to item actions


## 0.1.17 - 2025-05-27

### Fixed
- Removed 
 appearing on changelog entries


## 0.1.16 - 2025-05-27

### Fixed
- Fixed input handling and updating of changelog prompt\n
## 0.1.8 - 2025-05-26

### Fixed
- Refactored from monolithic architecture to modular
- Fixed proper dev scripts 
- Removed unnecessary files 

## [0.1.7] - 2025-05-26

### Fixed
- Errors following refactor related to release 

## [0.1.6] - 2025-05-26

### Fixed
- Refactored from JavaScript to Typescript
- Fixed naming of history location
- Fixed naming in application (fabric-tui -> weave)

## [0.1.5] - 2025-05-24

### Fixed 
- Fixed path to package

## [0.1.4] - 2025-05-24

### Fixed
- Fixed version inconsistencies in LoadingScreen component
- Corrected package.json path resolution for version display

## [0.1.3] - 2025-05-24

### Added
- Initial release with core functionality
- Interactive workspace browser
- Notebook job execution (background and synchronous)
- Job status monitoring
- Command history tracking
- Keyboard navigation support
- GitHub action for release
