# Unconnected anchor job controls

These standalone controls do not run in a workflow and do not authorize publication.
They are intended to be pinned by a separately reviewed workflow commit only after the
remaining trust boundary is implemented and verified.

`fetch_fixed_checkout.sh` takes a commit, expected tree, app tag, expected annotated-tag
object, direct tag target and SHA256 of the tag bytes. It checks input syntax, rejects known unsafe metadata, fetches from the fixed public
repository with a clean Git environment, and checks fsck, tree and tag identity. It assumes
`/repo` is a new isolated writable staging mount, initialized by trusted code with exactly the
four-entry config checked by the script and an empty object database, hooks and refs. Values
are claims: the caller must independently authenticate the fixed source and tag, Git binary,
bootstrap bytes, network origin and every required actual tree byte. Git fsck or SHA-1 alone
does not provide this authentication. The caller must prepare this environment before starting
the shell or any dependencies, prevent concurrent writes, and discard the whole staging area
after any failure. The script must not be pointed at a user's existing checkout.

`check_git_metadata.py` rejects a narrow set of unexpected Git metadata and requires a
read-only mount; it does not prove object provenance, binary identity or host-side isolation.
`write_direct_output.py` packages bounded evidence only when its bytes match the supplied hash.
The caller must invoke it only after a successful producer and must reject output from a failed
or cancelled job, including partially written output. Hashes and job fields are claims, not
authentication. Direct job outputs require independent same-run job/needs authentication and
field-level privacy review. No baseline or other private evidence is part of this change.

The isolated image and runner, verified dependencies, fixed verifier, live parent re-observation,
same-run needs and artifact identity, signing, deployment and production caller remain separate
work. Tests here do not establish those properties or make these controls safe by themselves.
