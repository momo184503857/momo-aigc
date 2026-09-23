content = open('src/components/FeatureNav.vue', encoding='utf-8').read()
content = content.rstrip()
idx = content.rfind('.group-title {')
content = content[:idx]
content += '.group-title {\n  padding: 8px 16px 4px;\n  font-size: var(--momo-font-size-sm);\n  color: var(--momo-color-text-ter