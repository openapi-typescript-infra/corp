SPEC_NAME := $(notdir $(CURDIR))
DIST_DIR := dist
COMMON_YAML_FILES := $(shell find ../common -name '*.yaml' 2>/dev/null)
SPEC_YAML_FILES := $(shell find . -path ./dist -prune -o -path ./node_modules -prune -o -name '*.yaml' -print 2>/dev/null)

.PHONY: all clean

all: $(DIST_DIR)/spec.json $(DIST_DIR)/client.ts

$(DIST_DIR)/spec.json: $(SPEC_YAML_FILES) $(COMMON_YAML_FILES)
	@mkdir -p $(DIST_DIR)
	yarn dlx @redocly/cli@latest bundle $(SPEC_NAME).yaml -o $@

$(DIST_DIR)/client.ts: $(DIST_DIR)/spec.json
	yarn openapi-typescript $< --enum-values -o $@

clean:
	rm -rf $(DIST_DIR)
