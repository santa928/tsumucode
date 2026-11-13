# Unconnected checkout byte comparison

This verifier compares one read-only checkout to a GitHub recursive-tree response and a
codeload archive that the caller must obtain independently using fixed-origin authenticated
HTTPS. It checks tree truncation, paths and modes, all checkout paths except root `.git`,
file type/link count, Git blob SHA1 and archive-to-checkout SHA256. Archive size, entry
count, individual files, decompressed bytes and individual parser reads are bounded.
Unexpected tar entries and PAX keys fail closed. It reads gzip to EOF to observe trailer
errors and rejects nonzero trailing data. The check of `tarfile._Stream.buf` uses an
implementation detail and rejects unsupported implementations; Python version and real
runner behavior must be independently verified before connection.

The verifier cannot authenticate the tree or archive's origin, the expected source/tree,
the Python interpreter or the filesystem. The trusted caller must bind the expected commit
to the current run, retrieve both fixed-origin HTTPS inputs without unsafe redirects, protect
the input files, bound network reads/time, and prevent host-side or same-UID mutation of the
checkout for the entire comparison and producer use. Checking a Git SHA1 tree or fsck alone
does not provide this boundary. A protected live-parent recheck and authenticated same-run
job/needs binding remain separate requirements. The public-fixture CI exercises this
prototype in a writable test workspace on pull requests only; no publication workflow
calls it, and that CI does not prove read-only isolation or runner authenticity.

The size limits and accepted GitHub codeload metadata are conservative. A valid but unusual
public source may be rejected, which must stop rather than weaken the check. Malicious PAX,
gzip and tar combinations require further adversarial review; local fixtures do not establish
a general-purpose safe archive parser or authenticate a signature.
