from __future__ import annotations

import importlib.util
import io
import pathlib
import tarfile
import tempfile
import unittest


MODULE_PATH = pathlib.Path(__file__).parents[1] / "deploy" / "validate-release-archive.py"
SPEC = importlib.util.spec_from_file_location("validate_release_archive", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
VALIDATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATOR)


class ArchiveValidatorTests(unittest.TestCase):
    def make_archive(self, root: pathlib.Path, members: list[tuple[str, bytes, str]]) -> pathlib.Path:
        archive_path = root / "release.tar.gz"
        with tarfile.open(archive_path, "w:gz") as archive:
            for name, content, kind in members:
                info = tarfile.TarInfo(name)
                if kind == "file":
                    info.size = len(content)
                    info.mode = 0o755 if name.endswith(".sh") else 0o644
                    archive.addfile(info, io.BytesIO(content))
                elif kind == "directory":
                    info.type = tarfile.DIRTYPE
                    archive.addfile(info)
                elif kind == "symlink":
                    info.type = tarfile.SYMTYPE
                    info.linkname = "elsewhere"
                    archive.addfile(info)
                else:
                    raise AssertionError(kind)
        return archive_path

    def test_extracts_regular_files_and_preserves_safe_executable_bit(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            destination = root / "output"
            destination.mkdir()
            archive = self.make_archive(root, [
                ("./", b"", "directory"),
                ("deploy/", b"", "directory"),
                ("deploy/run.sh", b"#!/bin/sh\n", "file"),
            ])

            VALIDATOR.main(str(archive), str(destination))

            extracted = destination / "deploy" / "run.sh"
            self.assertEqual(extracted.read_bytes(), b"#!/bin/sh\n")
            self.assertEqual(extracted.stat().st_mode & 0o777, 0o755)

    def test_rejects_traversal_symlinks_duplicates_and_nonempty_destination(self) -> None:
        cases = [
            [("../escape", b"x", "file")],
            [("link", b"", "symlink")],
            [("same", b"one", "file"), ("same", b"two", "file")],
        ]
        for members in cases:
            with self.subTest(members=members), tempfile.TemporaryDirectory() as temporary:
                root = pathlib.Path(temporary)
                destination = root / "output"
                destination.mkdir()
                archive = self.make_archive(root, members)
                with self.assertRaises(SystemExit):
                    VALIDATOR.main(str(archive), str(destination))

        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            destination = root / "output"
            destination.mkdir()
            (destination / "existing").write_text("x")
            archive = self.make_archive(root, [("file", b"x", "file")])
            with self.assertRaises(SystemExit):
                VALIDATOR.main(str(archive), str(destination))

    def test_rejects_entry_and_file_limits_before_writing_over_limit_member(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            destination = root / "output"
            destination.mkdir()
            archive = self.make_archive(root, [("one", b"x", "file"), ("two", b"y", "file")])
            previous_limit = VALIDATOR.MAX_ENTRIES
            VALIDATOR.MAX_ENTRIES = 1
            try:
                with self.assertRaises(SystemExit):
                    VALIDATOR.main(str(archive), str(destination))
            finally:
                VALIDATOR.MAX_ENTRIES = previous_limit

        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            destination = root / "output"
            destination.mkdir()
            archive = self.make_archive(root, [("large", b"xx", "file")])
            previous_limit = VALIDATOR.MAX_FILE_BYTES
            VALIDATOR.MAX_FILE_BYTES = 1
            try:
                with self.assertRaises(SystemExit):
                    VALIDATOR.main(str(archive), str(destination))
                self.assertFalse((destination / "large").exists())
            finally:
                VALIDATOR.MAX_FILE_BYTES = previous_limit

    def test_rejects_pax_metadata_before_extraction(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            destination = root / "output"
            destination.mkdir()
            archive_path = root / "pax.tar.gz"
            with tarfile.open(archive_path, "w:gz", format=tarfile.PAX_FORMAT, pax_headers={"comment": "x" * 1_000_000}) as archive:
                info = tarfile.TarInfo("file")
                info.size = 1
                archive.addfile(info, io.BytesIO(b"x"))

            with self.assertRaisesRegex(SystemExit, "extension or non-regular entry"):
                VALIDATOR.main(str(archive_path), str(destination))
            self.assertEqual(list(destination.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
