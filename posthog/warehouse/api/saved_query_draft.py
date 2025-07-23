from rest_framework import serializers

from posthog.api.routing import TeamAndOrgViewSetMixin
from posthog.warehouse.models.datawarehouse_saved_query_draft import DataWarehouseSavedQueryDraft
from rest_framework import viewsets


class DataWarehouseSavedQueryDraftSerializer(serializers.ModelSerializer):
    saved_query_id = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model = DataWarehouseSavedQueryDraft
        fields = ["id", "created_at", "updated_at", "query", "saved_query_id"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def create(self, validated_data):
        validated_data["team_id"] = self.context["team_id"]
        validated_data["created_by"] = self.context["request"].user
        draft = DataWarehouseSavedQueryDraft(**validated_data)
        draft.save()
        return draft


class DataWarehouseSavedQueryDraftViewSet(TeamAndOrgViewSetMixin, viewsets.ModelViewSet):
    scope_object = "INTERNAL"
    queryset = DataWarehouseSavedQueryDraft.objects.all()
    serializer_class = DataWarehouseSavedQueryDraftSerializer

    def safely_get_queryset(self, queryset):
        # API is scoped to user
        return queryset.filter(created_by=self.request.user)
