"""Export a tagged skill into SkillHub's publishing format."""
import argparse
import re
import shutil
from pathlib import Path

import yaml


def prepare(source: Path, destination: Path, tag: str) -> dict:
    text = (source / 'SKILL.md').read_text(encoding='utf-8')
    match = re.fullmatch(r'---\r?\n(.*?)\r?\n---\r?\n(.*)', text, re.S)
    if not match:
        raise ValueError('SKILL.md must contain YAML frontmatter')
    frontmatter = yaml.safe_load(match[1])
    metadata = frontmatter.get('metadata', {})
    slug = metadata.get('slug')
    version = metadata.get('version')
    display_name = metadata.get('display-name')
    if not isinstance(slug, str) or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug) or not 2 <= len(slug) <= 128:
        raise ValueError('metadata.slug must be a valid SkillHub slug')
    if not isinstance(version, str) or not re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)', version) or tag != f'v{version}':
        raise ValueError('Release tag must match metadata.version')
    if not isinstance(display_name, str) or not display_name.strip():
        raise ValueError('metadata.display-name must be set')
    if destination.resolve() == source.resolve() or source.resolve() in destination.resolve().parents:
        raise ValueError('Publishing destination must be outside the source tree')
    if destination.exists():
        raise ValueError('Publishing destination must be new')
    # Registry fields are derived only in the temporary distribution copy.
    exported = {**frontmatter, 'slug': slug, 'displayName': display_name, 'version': version}
    for field in ['summary', 'tags']:
        if field in metadata:
            exported[field] = metadata[field]
    destination.mkdir(parents=True)
    (destination / 'SKILL.md').write_text(
        '---\n' + yaml.safe_dump(exported, allow_unicode=True, sort_keys=False) + '---\n' + match[2],
        encoding='utf-8',
    )
    for directory in ['agents', 'scripts', 'workflows']:
        shutil.copytree(source / directory, destination / directory)
    return {'SKILL_SLUG': slug, 'SKILL_VERSION': version}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--destination', type=Path, required=True)
    parser.add_argument('--tag', required=True)
    args = parser.parse_args()
    for name, value in prepare(args.source, args.destination, args.tag).items():
        print(f'{name}={value}')
