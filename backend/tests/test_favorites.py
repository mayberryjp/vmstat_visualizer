from typing import Any

from webtest import TestApp

from vnstat_visualizer.api.app import create_app


def _keys(res: Any) -> list[str]:
    return [f"{i['hostname']}|{i['interface']}" for i in res.json["items"]]


def test_star_is_idempotent_and_appends_in_order(db: None) -> None:
    client = TestApp(create_app())
    assert client.get("/favorites").json["items"] == []

    client.put("/favorites/fw01/vtnet0")
    client.put("/favorites/fw02/em0")
    res = client.put("/favorites/fw01/vtnet0")

    assert _keys(res) == ["fw01|vtnet0", "fw02|em0"]
    assert res.json["total"] == 2


def test_unstar_removes_and_is_idempotent(db: None) -> None:
    client = TestApp(create_app())
    client.put("/favorites/fw01/igc1.30")
    client.put("/favorites/fw01/tun_wg0")

    assert _keys(client.delete("/favorites/fw01/igc1.30")) == ["fw01|tun_wg0"]
    assert _keys(client.delete("/favorites/fw01/igc1.30")) == ["fw01|tun_wg0"]


def test_reorder_applies_listed_first_and_ignores_unknown(db: None) -> None:
    client = TestApp(create_app())
    for host, iface in (("a", "x"), ("b", "y"), ("c", "z")):
        client.put(f"/favorites/{host}/{iface}")

    res = client.put_json(
        "/favorites/order",
        {
            "items": [
                {"hostname": "c", "interface": "z"},
                {"hostname": "nope", "interface": "none"},
                {"hostname": "a", "interface": "x"},
            ]
        },
    )

    assert _keys(res) == ["c|z", "a|x", "b|y"]
    assert _keys(client.get("/favorites")) == ["c|z", "a|x", "b|y"]


def test_validation_errors(db: None) -> None:
    client = TestApp(create_app())
    assert client.put("/favorites/bad%20host/em0", status=422).json["code"] == "validation_error"
    assert client.put_json("/favorites/order", {"items": "nope"}, status=422).json["code"] == (
        "validation_error"
    )
    assert client.put_json(
        "/favorites/order", {"items": [{"hostname": "ok"}]}, status=422
    ).json["code"] == "validation_error"
