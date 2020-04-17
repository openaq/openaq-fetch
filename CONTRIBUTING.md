# Contributing guidelines

There are many ways to contribute to a project, below are some examples:

- Report bugs, ideas, requests for features by creating “Issues” in the project repository.
- Fork the code and play with it, whether you later choose to make a pull request or not.
- Create pull requests of changes that you think are laudatory. From typos to major design flaws, you will find a target-rich environment for improvements.

## Issues

When creating a task through the issue tracker, please include the following where applicable: 

* A summary of identified tasks related to the issue; and
* Any dependencies related to completion of the task (include links to tickets with the dependency).

### Design and feature request issues should include:
* What the goal of the task being accomplished is; and
* The user need being addressed.

### Development issues should include:
* Unknowns tasks or dependencies that need investigation.

Use checklists (via `- [ ]`) to keep track of sub-items wherever possible.

## Coding style

When writing code it is generally a good idea to try and match your
formatting to that of any existing code in the same file, or to other
similar files if you are writing new code. Consistency of layout is
far more important that the layout itself as it makes reading code
much easier.

One golden rule of formatting -- please don't use tabs in your code
as they will cause the file to be formatted differently for different
people depending on how they have their editor configured.

## Comments

Sometimes it's not apparent from the code itself what it does, or,
more importantly, **why** it does that. Good comments help your fellow
developers to read the code and satisfy themselves that it's doing the
right thing.

When developing, you should:

* Comment your code - don't go overboard, but explain the bits which
might be difficult to understand what the code does, why it does it
and why it should be the way it is.
* Check existing comments to ensure that they are not misleading.

## Committing

When you submit patches, the project maintainer has to read them and
understand them. This is difficult enough at the best of times, and
misunderstanding patches can lead to them being more difficult to
merge. To help with this, when submitting you should:

* Split up large patches into smaller units of functionality.
* Keep your commit messages relevant to the changes in each individual
unit.

When writing commit messages please try and stick to the same style as
other commits, namely:

* A one line summary, starting with a capital and with no full stop.
* A blank line.
* Full description, as proper sentences with capitals and full stops.

For simple commits the one line summary is often enough and the body
of the commit message can be left out.

If you have forked on GitHub then the best way to submit your patches is to
push your changes back to GitHub and then send a "pull request" on GitHub.
