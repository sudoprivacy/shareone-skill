import tempfile
import unittest
from pathlib import Path

import yaml

from prepare_skillhub import prepare


class SkillHubExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.source = Path(self.temp.name) / 'release'
        self.destination = Path(self.temp.name) / 'publish'
        self.source.mkdir()
        self.content = """---
name: shareone
description: Publish pages
metadata:
  slug: shareone
  display-name: ShareOne
  version: 1.5.0
  summary: Share pages
  tags: [shareone]
---
# Skill

Keep the body exactly as written.
"""
        (self.source / 'SKILL.md').write_text(self.content, encoding='utf-8')
        for directory in ['agents', 'scripts', 'workflows']:
            (self.source / directory).mkdir()
            (self.source / directory / 'payload').write_text(directory)
        (self.source / '.shareone_credentials').write_text('must stay private')

    def test_provider_fields_and_payload_export_without_changing_source(self):
        self.assertEqual(prepare(self.source, self.destination, 'v1.5.0'),
                         {'SKILL_SLUG': 'shareone', 'SKILL_VERSION': '1.5.0'})
        exported = (self.destination / 'SKILL.md').read_text(encoding='utf-8')
        fields = yaml.safe_load(exported.split('---', 2)[1])
        self.assertEqual({key: fields[key] for key in ['slug', 'displayName', 'version', 'summary']},
                         {'slug': 'shareone', 'displayName': 'ShareOne', 'version': '1.5.0', 'summary': 'Share pages'})
        self.assertEqual(exported.split('---', 2)[2], self.content.split('---', 2)[2])
        self.assertEqual((self.source / 'SKILL.md').read_text(encoding='utf-8'), self.content)
        self.assertEqual({path.name for path in self.destination.iterdir()},
                         {'SKILL.md', 'agents', 'scripts', 'workflows'})
        for directory in ['agents', 'scripts', 'workflows']:
            self.assertEqual((self.destination / directory / 'payload').read_text(), directory)

    def test_wrong_release_tag_rejects_before_writing(self):
        with self.assertRaisesRegex(ValueError, 'Release tag'):
            prepare(self.source, self.destination, 'v1.4.0')
        self.assertFalse(self.destination.exists())

    def test_destination_cannot_modify_release_tree(self):
        with self.assertRaisesRegex(ValueError, 'outside the source'):
            prepare(self.source, self.source / 'publish', 'v1.5.0')
        self.assertEqual((self.source / 'SKILL.md').read_text(encoding='utf-8'), self.content)


if __name__ == '__main__':
    unittest.main()
