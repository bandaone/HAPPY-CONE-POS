def test_receipt_waste_count_and_permissions(client, login):
    headers = login()

    def balance():
        return next(
            i
            for i in client.get("/api/inventory", headers=headers).json()
            if i["id"] == "cones"
        )["on_hand"]

    assert balance() == "200.000"
    data = {
        "item_id": "cones",
        "type": "RECEIPT",
        "quantity": "10.000",
        "reason": "Delivery",
    }
    assert (
        client.post(
            "/api/inventory/movements", headers=login("cashier"), json=data
        ).status_code
        == 403
    )
    assert (
        client.post("/api/inventory/movements", headers=headers, json=data).status_code
        == 201
    )
    data.update(type="WASTE", quantity="2.000", reason="Broken cones")
    assert (
        client.post("/api/inventory/movements", headers=headers, json=data).json()[
            "quantity"
        ]
        == "-2.000"
    )
    assert balance() == "208.000"
    response = client.post(
        "/api/inventory/counts",
        headers=headers,
        json={
            "item_id": "cones",
            "counted_quantity": "205.000",
            "reason": "Evening count",
        },
    )
    assert response.status_code == 201
    assert response.json()["variance"] == "-3.000"
    assert balance() == "208.000"
    data["quantity"] = "-1"
    assert (
        client.post("/api/inventory/movements", headers=headers, json=data).status_code
        == 422
    )
    data["quantity"] = "300"
    assert (
        client.post("/api/inventory/movements", headers=headers, json=data).status_code
        == 409
    )


def test_stock_item_setup_pack_conversion_and_activation(client, login):
    from sqlalchemy import func, select

    from app.models.inventory import StockMovement
    from app.models.stand_settings import StandSettings

    manager = login("manager")
    created = client.post(
        "/api/inventory/items",
        headers=manager,
        json={
            "id": "test-sprinkles-stock",
            "name": "Sprinkles",
            "base_unit": "g",
            "pack_name": "bag",
            "units_per_pack": "500",
            "low_stock_threshold": "250",
        },
    )
    assert created.status_code == 201
    assert created.json()["pack_name"] == "bag"
    assert created.json()["units_per_pack"] == "500.000"

    delivery = client.post(
        "/api/inventory/movements",
        headers=manager,
        json={
            "item_id": "test-sprinkles-stock",
            "type": "RECEIPT",
            "quantity": "2",
            "quantity_in_packs": True,
            "reason": "Two bags delivered",
        },
    )
    assert delivery.status_code == 201
    assert delivery.json()["quantity"] == "1000.000"

    archived = client.patch(
        "/api/inventory/items/test-sprinkles-stock/archive",
        headers=manager,
        json={"active": False},
    )
    assert archived.status_code == 200
    assert archived.json()["active"] is False
    assert all(
        item["id"] != "test-sprinkles-stock"
        for item in client.get("/api/inventory", headers=manager).json()
    )
    assert any(
        item["id"] == "test-sprinkles-stock"
        for item in client.get(
            "/api/inventory?include_inactive=true", headers=manager
        ).json()
    )

    with client.app.state.session_factory() as db:
        before = db.scalar(select(func.count()).select_from(StockMovement))
        settings = db.get(StandSettings, 1)
        assert settings is None or settings.inventory_tracking_enabled is False
    activation = client.post(
        "/api/inventory/activate",
        headers=manager,
        json={
            "opening_quantities": [
                {"item_id": "vanilla-stock", "quantity": "20000"},
                {"item_id": "chocolate-stock", "quantity": "15000"},
                {"item_id": "strawberry-stock", "quantity": "12000"},
                {"item_id": "cones", "quantity": "200"},
                {"item_id": "cups", "quantity": "200"},
                {"item_id": "oreo-stock", "quantity": "3000"},
                {"item_id": "sprinkles-stock", "quantity": "2500"},
                {"item_id": "sauce-stock", "quantity": "3000"},
                {"item_id": "napkins", "quantity": "500"},
            ],
        },
    )
    assert activation.status_code == 200
    assert activation.json()["inventory_tracking_enabled"] is True
    with client.app.state.session_factory() as db:
        after = db.scalar(select(func.count()).select_from(StockMovement))
        assert after == before + 9
        assert db.get(StandSettings, 1).inventory_tracking_enabled is True


def test_inventory_activation_requires_opening_quantity_for_every_recipe_item(
    client, login
):
    manager = login("manager")
    response = client.post(
        "/api/inventory/activate",
        headers=manager,
        json={
            "opening_quantities": [{"item_id": "cones", "quantity": "200"}],
        },
    )
    assert response.status_code == 422
    assert "opening quantity" in response.json()["detail"].lower()
