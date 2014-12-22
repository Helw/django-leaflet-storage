from django.contrib.gis.db import models


class PublicManager(models.GeoManager):

    def get_queryset(self):
        return super(PublicManager, self).get_queryset().filter(
            share_status=self.model.PUBLIC)
