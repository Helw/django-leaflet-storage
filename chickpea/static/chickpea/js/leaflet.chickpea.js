L.Map.mergeOptions({
    base_layers: null,
    overlay_layers: null,
    categories: [],
    zoom: 10,
    lat: null,
    lng: null,
    hash: true,
    embedControl: true,
    layersControl: true,
    default_color: "DarkBlue"
});

L.ChickpeaMap = L.Map.extend({
    initialize: function (/* DOM element or id*/ el, /* Object*/ options) {
        // Call the parent
        L.Map.prototype.initialize.call(this, el, options);
        // User must provide a pk
        if (typeof this.options.chickpea_id == "undefined") {
            alert("ImplementationError: you must provide a chickpea_id for ChickpeaMap.");
        }

        if (this.options.allowEdit) {
            // Layer for items added by users
            var drawnItems = new L.LayerGroup();
            this.on('draw:marker-created', function (e) {
                drawnItems.addLayer(e.marker);
                e.marker.edit();
            });
            this.on('draw:poly-created', function (e) {
                drawnItems.addLayer(e.poly);
                e.poly.edit();
            });
            this.on("popupclose", function(e) {
                // remove source if it has not been created (no chickpea_id)
                var layer = e.popup._source;
                var id = L.Util.stamp(layer);
                // Prevent from caching popup in edit mode
                if(this.editEnabled) {
                    layer._popup = null;
                }
                if(drawnItems._layers.hasOwnProperty(id)
                    && !layer.chickpea_id) {
                    drawnItems.removeLayer(layer);
                }
            });
            this.addLayer(drawnItems);
        }

        this.tilelayers = {};
        for(var i in this.options.tilelayers) {
            if(this.options.tilelayers.hasOwnProperty(i)) {
                this.addTileLayer(this.options.tilelayers[i]);
            }
        }

        if (this.options.hash) {
            // Hash management (for permalink)
            this.hash = new L.Hash(this);
        }

        if (this.options.hash && this.hash.parseHash(location.hash)) {
            // FIXME An invalid hash will cause the load to fail
            this.hash.update();
        }
        else if(options.locate && options.locate.setView) {
            // Prevent from making two setViews at init
            // which is not very fluid...
            this.locate(options.locate);
        }
        else {
            var center = new L.LatLng(this.options.lat, this.options.lng);
            this.setView(center, this.options.zoom);
        }

        // Init control layers
        // It will be populated while creating the overlays
        this.chickpea_layers_control = new L.Control.ChickpeaLayers(
            this.options.tilelayers.length > 1? this.tilelayers: {}
        );
        if (this.options.layersControl) {
            this.addControl(this.chickpea_layers_control);
        }

        // Global storage for retrieving overlays
        this.chickpea_overlays = {};
        this.marker_to_overlay = {};
        // create overlays
        for(var j in this.options.categories) {
            if(this.options.categories.hasOwnProperty(j)){
                this._createOverlay(this.options.categories[j]);
            }
        }
    },
    addTileLayer: function (options) {
        var tilelayer = new L.TileLayer(
            options.tilelayer.url_template,
            {
                attribution: options.tilelayer.attribution,
                minZoom: options.tilelayer.minZoom,
                maxZoom: options.tilelayer.maxZoom
            }
        );
        // Add only the firs to the map, to make it visible,
        // and the other only when user click on them
        if(options.rank == 1) {
            this.addLayer(tilelayer);
        }
        this.tilelayers[options.tilelayer.name] = tilelayer;
    },

    _createOverlay: function(category) {
        return new L.ChickpeaLayer(category, this);
    },

    updateExtent: function() {
        // Save in db the current center and zoom
        var latlng = this.getCenter(),
            zoom = this.getZoom();
            center = {
                type: "Point",
                coordinates: [
                    latlng.lng,
                    latlng.lat
                ]
            },
            url = L.Util.template(this.options.urls.map_update_extent, {'pk': this.options.chickpea_id}),
            formData = new FormData();
            formData.append('center', JSON.stringify(center));
            formData.append('zoom', zoom);
        L.Util.Xhr.post(url, {
            'data': formData
        });
    },

    updateTileLayers: function () {
        var url = L.Util.template(this.options.urls.map_update_tilelayers, {'pk': this.options.chickpea_id});
        L.Util.Xhr.get(url, {
            'callback': function (data) {
                L.Chickpea.fire("modal_ready", {'data': data, "cssClass": "update-tilelayers"});
            }
        });
    },

    updateInfos: function () {
        var url = L.Util.template(this.options.urls.map_update, {'pk': this.options.chickpea_id});
        L.Util.Xhr.get(url, {
            'callback': function (data) {
                L.Chickpea.fire("modal_ready", {'data': data, "cssClass": "update-infos"});
            }
        });
    },

    uploadData: function () {
        var map = this;
        var handle_response = function (data) {
            L.Chickpea.fire("modal_ready", {'data': data, "cssClass": "upload-data"});
            L.Util.Xhr.listen_form("upload_data", {
                'callback': function (data) {
                    if (data.category) {
                        var layer = map.chickpea_overlays[data.category.pk];
                        layer.clearLayers();
                        layer.fetchData();
                        L.Chickpea.fire('modal_close');
                        if (data.info) {
                            L.Chickpea.fire("alert", {"content": data.info, "level": "info"});
                        }
                    }
                    else if (data.error) {
                        L.Chickpea.fire("alert", {"content": data.error, "level": "error"});
                    }
                    else {
                        // start again
                        handle_response(data);
                    }
                }
            });
        };
        var url = L.Util.template(this.options.urls.upload_data, {'map_id': this.options.chickpea_id});
        L.Util.Xhr.get(url, {
            'callback': handle_response
        });
    }

});