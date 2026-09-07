CITY ?= malaga
PY   ?= python3

.PHONY: help sources thesis gazetteers names classify build terrain web single all clean

help:
	@grep -E '^[a-z-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

all: sources thesis gazetteers names build terrain web  ## Everything, in order

sources:     ## Download the municipal callejero and the INE registers
	$(PY) -m pipeline.sources

thesis:      ## Extract the annex tables from the doctoral thesis PDF
	$(PY) -m pipeline.thesis

gazetteers:  ## Build the INE name, surname and municipality lookups
	$(PY) -m pipeline.gazetteers

names:       ## Recover accented spellings from the cartographic labels
	$(PY) -m pipeline.cities.malaga_names

classify:    ## Send the unresolved tail to Claude (needs ANTHROPIC_API_KEY)
	$(PY) -m pipeline.llm_classify --city $(CITY)

build:       ## Measure and classify a city, and write its bundle
	$(PY) -m pipeline.build --city $(CITY)

terrain:     ## Bake the city's relief from public elevation tiles
	$(PY) -m pipeline.terrain --city $(CITY)

web:         ## Copy the bundles in and build the static site
	mkdir -p web/public/data
	cp data/out/$(CITY).json data/out/$(CITY).geo.json data/out/$(CITY).terrain.json web/public/data/
	cd web && npm install --silent && npm run build

single:      ## Build the demo as one self-contained HTML file
	cd web && npm run bundle

dev:         ## Run the viewer against the built bundles
	cd web && npm run dev

clean:
	rm -rf data/out web/dist web/dist-single web/public/data
