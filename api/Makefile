DIST_DIR := dist
EXCLUDE_DIRS := dist node_modules src common
ALL_DIRS := $(filter-out $(addsuffix /,$(EXCLUDE_DIRS)),$(wildcard */))
SPEC_NAMES := $(patsubst %/,%,$(ALL_DIRS))
COMMON_YAML_FILES := $(shell find ./common -name '*.yaml' 2>/dev/null)

# Convert kebab-case to camelCase
pascal_case = $(shell node -e "process.stdout.write('$(1)'.replace(/(^|-)./g, s => s.at(-1).toUpperCase()))")
spec_yaml_files = $(shell find ./$(1) -name '*.yaml' 2>/dev/null)

.PHONY: all clean
all:

# Bundle spec and generate client for each service
define service_rules
$(DIST_DIR)/specs/$(1).json: $(call spec_yaml_files,$(1)) $(COMMON_YAML_FILES)
	@mkdir -p $(DIST_DIR)/specs
	npx --yes @redocly/cli@latest bundle $(1)/$(1).yaml -o $$@

$(DIST_DIR)/$(call pascal_case,$(1)).ts: $(DIST_DIR)/specs/$(1).json
	npx --yes openapi-typescript $$< --enum-values -o $$@

ALL_CLIENTS += $(DIST_DIR)/$(call pascal_case,$(1)).ts
endef

$(foreach name,$(SPEC_NAMES),$(eval $(call service_rules,$(name))))

all: $(ALL_CLIENTS)


clean:
	rm -rf $(DIST_DIR)
